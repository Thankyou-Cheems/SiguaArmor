"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";
import {
  type DragEvent as ReactDragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { armorPath } from "../lib/public-site-topology.mjs";
import {
  createDefaultVehicleRankerBoard,
  importVehicleRankerCards,
  moveVehicleRankerCard,
  normalizeVehicleRankerBoard,
  removeVehicleRankerCard,
  removeVehicleRankerTier,
  reorderVehicleRankerTier,
  VEHICLE_RANKER_TONES,
  VEHICLE_RANKER_UNRANKED_ID,
} from "../lib/vehicle-ranker-model.ts";
import { wikiAssetUrl } from "../lib/wiki-source.ts";
import { loadPublicRankerCatalog } from "./catalog-bootstrap.ts";
import type {
  CatalogSearchRecord,
  CatalogSearchVariant,
  PublicCatalogIndex,
} from "./catalog-types.ts";
import { searchCatalogIndexRecords } from "./vehicle-search.ts";
import type { SiteEdition } from "./site-edition.ts";

const DRAG_MIME = "application/x-sigua-vehicle-ranker-card";
const MAX_SEARCH_RESULTS = 14;

interface RankerVehicleCard {
  id: string;
  name: string;
  configuration: string | null;
  factionId: string;
  faction: string;
  typeName: string;
  thumbnail: CatalogSearchVariant["thumbnail"];
}

function internalCatalogHref(siteEdition: SiteEdition) {
  if (process.env.NODE_ENV === "development") {
    return siteEdition === "china" ? "/china" : "/";
  }
  return armorPath(siteEdition);
}

function storageKey(siteEdition: SiteEdition) {
  return `siguaarmor:vehicle-ranker:board:v2:${siteEdition}`;
}

function selectedVariant(record: CatalogSearchRecord) {
  return record.variants.find(({ cardId }) => cardId === record.defaultCardId) ??
    record.variants.find(({ sourceRawName }) => sourceRawName === record.selectedRawName) ??
    record.variants[0] ?? null;
}

function vehicleCard(record: CatalogSearchRecord): RankerVehicleCard | null {
  const variant = selectedVariant(record);
  if (!variant) return null;
  const configuration = variant.presentation?.configurationZh || variant.alias || null;
  return {
    id: record.promoEntryId,
    name: record.selectedDisplayName || record.official.nameZh || variant.displayName,
    configuration: configuration && configuration !== record.official.nameZh
      ? configuration
      : null,
    factionId: record.official.groupId,
    faction: record.official.groupNameZh,
    typeName: record.official.typeNameZh,
    thumbnail: variant.thumbnail ?? null,
  };
}

function cardsFromCatalog(catalog: PublicCatalogIndex) {
  return catalog.records.flatMap((record) => {
    const card = vehicleCard(record);
    return card ? [card] : [];
  });
}

function readDraggedCardId(
  event: ReactDragEvent<HTMLElement>,
  fallback: string | null,
) {
  return event.dataTransfer.getData(DRAG_MIME) ||
    event.dataTransfer.getData("text/plain") ||
    fallback;
}

function RankerCard({
  card,
  locationId,
  onDragStart,
  onRemove,
  onDropBefore,
}: {
  card: RankerVehicleCard;
  locationId: string;
  onDragStart: (event: ReactDragEvent<HTMLElement>, cardId: string) => void;
  onRemove: (cardId: string) => void;
  onDropBefore: (event: ReactDragEvent<HTMLElement>, destinationId: string, cardId: string) => void;
}) {
  return (
    <article
      className="vehicle-ranker-card"
      draggable
      data-ranker-card={card.id}
      onDragStart={(event) => onDragStart(event, card.id)}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => onDropBefore(event, locationId, card.id)}
    >
      <span className="vehicle-ranker-card__visual">
        {card.thumbnail ? (
          // Shared card art is served directly by SiguaWiki.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={wikiAssetUrl(card.thumbnail.path)}
            width={card.thumbnail.width}
            height={card.thumbnail.height}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
          />
        ) : null}
      </span>
      <span className="vehicle-ranker-card__copy">
        <strong>{card.name}</strong>
        {card.configuration ? <small>{card.configuration}</small> : null}
      </span>
      <button
        className="vehicle-ranker-card__remove"
        type="button"
        aria-label={`移除 ${card.name}`}
        title="移出榜单"
        onClick={() => onRemove(card.id)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </article>
  );
}

export function VehicleRankerApp({ siteEdition }: { siteEdition: SiteEdition }) {
  const [catalog, setCatalog] = useState<PublicCatalogIndex | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const [recordingMode, setRecordingMode] = useState(false);
  const [board, setBoard] = useState(createDefaultVehicleRankerBoard);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const storageReadyRef = useRef(false);
  const transparentDragImageRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let active = true;
    void loadPublicRankerCatalog(siteEdition)
      .then((nextCatalog) => {
        if (!active) return;
        setCatalog(nextCatalog);
        setCatalogError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCatalogError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [siteEdition]);

  const cards = useMemo(
    () => catalog ? cardsFromCatalog(catalog) : [],
    [catalog],
  );
  const cardsById = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );
  const factionImports = useMemo(() =>
    (catalog?.groups ?? []).flatMap((group) => {
      const cardIds = cards
        .filter((card) => card.factionId === group.id)
        .map((card) => card.id);
      return cardIds.length > 0
        ? [{ id: group.id, name: group.name, cardIds }]
        : [];
    }),
  [cards, catalog]);

  useEffect(() => {
    if (!catalog || storageReadyRef.current) return;
    const allowedCardIds = new Set(cards.map(({ id }) => id));
    try {
      const saved = window.localStorage.getItem(storageKey(siteEdition));
      setBoard(normalizeVehicleRankerBoard(
        saved ? JSON.parse(saved) : null,
        allowedCardIds,
      ));
    } catch {
      setBoard(createDefaultVehicleRankerBoard());
    }
    storageReadyRef.current = true;
  }, [cards, catalog, siteEdition]);

  useEffect(() => {
    if (!storageReadyRef.current) return;
    try {
      window.localStorage.setItem(storageKey(siteEdition), JSON.stringify(board));
    } catch {
      // Ranking remains fully usable when storage is disabled or unavailable.
    }
  }, [board, siteEdition]);

  const locations = useMemo(() => {
    const result = new Map<string, string>();
    board.tiers.forEach((tier) => tier.cardIds.forEach((cardId) => result.set(cardId, tier.id)));
    board.unrankedCardIds.forEach((cardId) => result.set(cardId, VEHICLE_RANKER_UNRANKED_ID));
    return result;
  }, [board]);
  const usedCardIds = useMemo(() => new Set(locations.keys()), [locations]);
  const draggedCard = draggedCardId ? cardsById.get(draggedCardId) ?? null : null;
  const searchResults = useMemo(() => {
    if (!catalog || !query.trim()) return [];
    return searchCatalogIndexRecords(catalog.records, query, MAX_SEARCH_RESULTS)
      .flatMap(({ record }) => {
        const card = cardsById.get(record.promoEntryId);
        return card ? [card] : [];
      });
  }, [cardsById, catalog, query]);

  useEffect(() => {
    if (!draggedCardId) return;
    const followPointer = (event: DragEvent) => {
      if (event.clientX === 0 && event.clientY === 0) return;
      setDragPosition({ x: event.clientX, y: event.clientY });
    };
    document.addEventListener("dragover", followPointer);
    document.addEventListener("drag", followPointer);
    return () => {
      document.removeEventListener("dragover", followPointer);
      document.removeEventListener("drag", followPointer);
    };
  }, [draggedCardId]);

  useEffect(() => {
    if (!recordingMode) return;
    const exitRecordingMode = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRecordingMode(false);
    };
    document.addEventListener("keydown", exitRecordingMode);
    return () => document.removeEventListener("keydown", exitRecordingMode);
  }, [recordingMode]);

  const moveCard = (cardId: string, destinationId: string, beforeCardId?: string | null) => {
    if (!cardsById.has(cardId)) return;
    setBoard((current) => moveVehicleRankerCard(
      current,
      cardId,
      destinationId,
      beforeCardId,
    ));
  };
  const importFaction = (name: string, cardIds: readonly string[]) => {
    const missingCardIds = cardIds.filter((cardId) => !locations.has(cardId));
    if (missingCardIds.length === 0) {
      setImportNotice(`${name}的载具已经全部在榜单中`);
      return;
    }
    setBoard((current) => importVehicleRankerCards(current, cardIds));
    setImportNotice(`已将${name}的 ${missingCardIds.length} 辆载具加入待排名区`);
  };
  const startDrag = (event: ReactDragEvent<HTMLElement>, cardId: string) => {
    setDraggedCardId(cardId);
    setDragPosition({ x: event.clientX, y: event.clientY });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_MIME, cardId);
    event.dataTransfer.setData("text/plain", cardId);
    if (transparentDragImageRef.current) {
      event.dataTransfer.setDragImage(transparentDragImageRef.current, 0, 0);
    }
  };
  const dropInto = (event: ReactDragEvent<HTMLElement>, destinationId: string) => {
    event.preventDefault();
    const cardId = readDraggedCardId(event, draggedCardId);
    if (cardId) moveCard(cardId, destinationId);
    setDraggedCardId(null);
    setDragPosition(null);
    setDropTargetId(null);
  };
  const dropBefore = (
    event: ReactDragEvent<HTMLElement>,
    destinationId: string,
    beforeCardId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const cardId = readDraggedCardId(event, draggedCardId);
    if (cardId && cardId !== beforeCardId) moveCard(cardId, destinationId, beforeCardId);
    setDraggedCardId(null);
    setDragPosition(null);
    setDropTargetId(null);
  };
  const renderCard = (cardId: string, locationId: string) => {
    const card = cardsById.get(cardId);
    if (!card) return null;
    return (
      <RankerCard
        key={card.id}
        card={card}
        locationId={locationId}
        onDragStart={startDrag}
        onRemove={(id) => setBoard((current) => removeVehicleRankerCard(current, id))}
        onDropBefore={dropBefore}
      />
    );
  };
  const rankedCount = [...locations.keys()].length;

  if (catalogError) {
    return (
      <main className="vehicle-ranker vehicle-ranker--message">
        <strong>载具目录加载失败</strong>
        <p>{catalogError}</p>
      </main>
    );
  }
  if (!catalog) {
    return <main className="vehicle-ranker vehicle-ranker--message"><strong>正在载入载具卡片</strong></main>;
  }

  return (
    <main
      className="vehicle-ranker"
      data-site-edition={siteEdition}
      data-recording={recordingMode ? "true" : undefined}
      onDragEnd={() => {
        setDraggedCardId(null);
        setDragPosition(null);
        setDropTargetId(null);
      }}
    >
      <span
        ref={transparentDragImageRef}
        className="vehicle-ranker__transparent-drag-image"
        aria-hidden="true"
      />
      {draggedCard && dragPosition ? (
        <div
          className="vehicle-ranker__drag-overlay"
          style={{ left: dragPosition.x, top: dragPosition.y }}
          aria-hidden="true"
        >
          <span>
            {draggedCard.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={wikiAssetUrl(draggedCard.thumbnail.path)}
                width={draggedCard.thumbnail.width}
                height={draggedCard.thumbnail.height}
                alt=""
              />
            ) : null}
          </span>
          <strong>{draggedCard.name}</strong>
          {draggedCard.configuration ? <small>{draggedCard.configuration}</small> : null}
        </div>
      ) : null}
      <header className="vehicle-ranker__heading">
        {recordingMode ? (
          <button
            className="vehicle-ranker__recording-brand"
            type="button"
            aria-label="退出录制模式"
            onClick={() => setRecordingMode(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- shared brand logo is served by SiguaWiki */}
            <img
              src={wikiAssetUrl("/assets/brand/siguad-wiki-logo.svg")}
              width={30}
              height={35}
              alt="丝瓜地"
            />
            <span><kbd>ESC</kbd> 退出录制模式</span>
          </button>
        ) : null}
        <Link className="vehicle-ranker__back" href={internalCatalogHref(siteEdition)}>
          <ArrowLeft size={15} aria-hidden="true" />
          <span>载具目录</span>
        </Link>
        <div className="vehicle-ranker__title">
          <span className="vehicle-ranker__eyebrow">SIGUA ARMOR / VEHICLE TIER LIST</span>
          <h1>从夯到拉排名器</h1>
        </div>
        <div className="vehicle-ranker__heading-actions">
          <span><b>{rankedCount}</b> 辆已入榜</span>
          <button type="button" onClick={() => setRecordingMode(true)}>
            <Video size={13} aria-hidden="true" />
            录制模式
          </button>
          <button
            type="button"
            disabled={rankedCount === 0}
            onClick={() => setBoard((current) => ({
              ...current,
              tiers: current.tiers.map((tier) => ({ ...tier, cardIds: [] })),
              unrankedCardIds: [],
            }))}
          >
            <Trash2 size={13} aria-hidden="true" />
            清空卡片
          </button>
        </div>
      </header>

      <div
        className="vehicle-ranker__workspace"
        data-catalog-collapsed={catalogCollapsed ? "true" : undefined}
      >
        <aside
          className="vehicle-ranker__catalog"
          aria-label="搜索并添加载具"
          data-collapsed={catalogCollapsed ? "true" : undefined}
        >
          <header>
            <div>
              <strong>载具卡片</strong>
              <small>{cards.length} 辆可搜索</small>
            </div>
            <button
              className="vehicle-ranker__catalog-toggle"
              type="button"
              aria-expanded={!catalogCollapsed}
              aria-label={catalogCollapsed ? "展开载具添加面板" : "收起载具添加面板"}
              onClick={() => setCatalogCollapsed((current) => !current)}
            >
              <span>{catalogCollapsed ? "展开" : "收起"}</span>
              {catalogCollapsed
                ? <ChevronDown size={14} aria-hidden="true" />
                : <ChevronUp size={14} aria-hidden="true" />}
            </button>
          </header>
          {!catalogCollapsed ? (
            <div className="vehicle-ranker__catalog-content">
              <label className="vehicle-ranker__search">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  placeholder="搜索名称、俗称、拼音或阵营"
                  autoComplete="off"
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query ? (
                  <button type="button" aria-label="清空搜索" onClick={() => setQuery("")}>
                    <X size={13} aria-hidden="true" />
                  </button>
                ) : null}
              </label>
              <section className="vehicle-ranker__faction-import" aria-labelledby="faction-import-title">
                <header>
                  <div>
                    <strong id="faction-import-title">一键导入阵营</strong>
                    <small>只补充尚未入榜的载具</small>
                  </div>
                  {importNotice ? <span aria-live="polite">{importNotice}</span> : null}
                </header>
                <div>
                  {factionImports.map((faction) => {
                    const missingCount = faction.cardIds.filter((cardId) => !usedCardIds.has(cardId)).length;
                    return (
                      <button
                        key={faction.id}
                        type="button"
                        disabled={missingCount === 0}
                        onClick={() => importFaction(faction.name, faction.cardIds)}
                      >
                        <strong>{faction.name}</strong>
                        <small>{missingCount === 0 ? "已全部导入" : `导入 ${missingCount} 辆`}</small>
                      </button>
                    );
                  })}
                </div>
              </section>
              <div className="vehicle-ranker__search-results" aria-live="polite">
                {!query.trim() ? (
                  <div className="vehicle-ranker__search-empty">
                    <Search size={24} aria-hidden="true" />
                    <strong>找一辆载具开始</strong>
                    <span>例如：99A、轮式步战、USA</span>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="vehicle-ranker__search-empty">
                    <strong>没有匹配的载具</strong>
                    <span>换个名称、俗称或阵营试试</span>
                  </div>
                ) : searchResults.map((card) => {
                  const added = usedCardIds.has(card.id);
                  return (
                    <article
                      className="vehicle-ranker__search-card"
                      key={card.id}
                      draggable
                      data-ranker-card={card.id}
                      data-added={added ? "true" : undefined}
                      onDragStart={(event) => startDrag(event, card.id)}
                    >
                      <span className="vehicle-ranker__search-visual">
                        {card.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={wikiAssetUrl(card.thumbnail.path)}
                            width={card.thumbnail.width}
                            height={card.thumbnail.height}
                            alt=""
                            draggable={false}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : null}
                      </span>
                      <span>
                        <strong>{card.name}</strong>
                        <small>{card.faction} · {card.typeName}</small>
                      </span>
                      <button
                        type="button"
                        disabled={added}
                        aria-label={added ? `${card.name} 已添加` : `添加 ${card.name} 到待排名区`}
                        title={added ? "已添加" : "加到待排名区"}
                        onClick={() => moveCard(card.id, VEHICLE_RANKER_UNRANKED_ID)}
                      >
                        {added ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                      </button>
                    </article>
                  );
                })}
              </div>
              <p>卡片和分级只保存在当前浏览器，不会上传。</p>
            </div>
          ) : null}
        </aside>

        <section className="vehicle-ranker__board" aria-label="载具分级榜单">
          <header className="vehicle-ranker__board-tools">
            <div>
              <strong>你的分级</strong>
              <span>拖动卡片排序；直接修改左侧等级名</span>
            </div>
            <div>
              <button
                type="button"
                disabled={board.tiers.length >= 8}
                onClick={() => setBoard((current) => {
                  if (current.tiers.length >= 8) return current;
                  const index = current.tiers.length;
                  return {
                    ...current,
                    tiers: [...current.tiers, {
                      id: `tier-${Date.now().toString(36)}`,
                      label: `等级 ${index + 1}`,
                      tone: VEHICLE_RANKER_TONES[index % VEHICLE_RANKER_TONES.length],
                      cardIds: [],
                    }],
                  };
                })}
              >
                <Plus size={13} aria-hidden="true" />
                新增等级
              </button>
              <button
                type="button"
                onClick={() => {
                  if (rankedCount > 0 && !window.confirm("恢复默认等级会把现有卡片移到待排名区，继续吗？")) return;
                  setBoard(() => ({
                    ...createDefaultVehicleRankerBoard(),
                    unrankedCardIds: [...locations.keys()],
                  }));
                }}
              >
                <RotateCcw size={13} aria-hidden="true" />
                默认等级
              </button>
            </div>
          </header>

          <div className="vehicle-ranker__tiers">
            {board.tiers.map((tier, tierIndex) => (
              <article
                className="vehicle-ranker__tier"
                key={tier.id}
                data-tier-tone={tier.tone}
                data-drop-active={dropTargetId === tier.id ? "true" : undefined}
              >
                <header>
                  <span>{String(tierIndex + 1).padStart(2, "0")}</span>
                  <input
                    value={tier.label}
                    readOnly={recordingMode}
                    maxLength={12}
                    aria-label={`第 ${tierIndex + 1} 档名称`}
                    onChange={(event) => setBoard((current) => ({
                      ...current,
                      tiers: current.tiers.map((candidate) =>
                        candidate.id === tier.id
                          ? { ...candidate, label: event.target.value }
                          : candidate
                      ),
                    }))}
                    onBlur={() => {
                      if (tier.label.trim()) return;
                      setBoard((current) => ({
                        ...current,
                        tiers: current.tiers.map((candidate) =>
                          candidate.id === tier.id
                            ? { ...candidate, label: `等级 ${tierIndex + 1}` }
                            : candidate
                        ),
                      }));
                    }}
                  />
                  <nav aria-label={`${tier.label || `等级 ${tierIndex + 1}`} 操作`}>
                    <button
                      type="button"
                      disabled={tierIndex === 0}
                      aria-label="上移等级"
                      onClick={() => setBoard((current) => reorderVehicleRankerTier(current, tier.id, -1))}
                    >
                      <ArrowUp size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={tierIndex === board.tiers.length - 1}
                      aria-label="下移等级"
                      onClick={() => setBoard((current) => reorderVehicleRankerTier(current, tier.id, 1))}
                    >
                      <ArrowDown size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={board.tiers.length <= 1}
                      aria-label="删除等级"
                      onClick={() => setBoard((current) => removeVehicleRankerTier(current, tier.id))}
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </nav>
                </header>
                <div
                  className="vehicle-ranker__dropzone"
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDropTargetId(tier.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => dropInto(event, tier.id)}
                >
                  {tier.cardIds.length === 0 ? <span>拖一张载具卡到这里</span> : null}
                  {tier.cardIds.map((cardId) => renderCard(cardId, tier.id))}
                </div>
              </article>
            ))}
          </div>

          <article
            className="vehicle-ranker__unranked"
            data-drop-active={dropTargetId === VEHICLE_RANKER_UNRANKED_ID ? "true" : undefined}
          >
            <header>
              <strong>待排名</strong>
              <span>{board.unrankedCardIds.length} 辆</span>
            </header>
            <div
              className="vehicle-ranker__dropzone"
              onDragEnter={(event) => {
                event.preventDefault();
                setDropTargetId(VEHICLE_RANKER_UNRANKED_ID);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => dropInto(event, VEHICLE_RANKER_UNRANKED_ID)}
            >
              {board.unrankedCardIds.length === 0 ? <span>点击左侧 +，或把暂时拿不准的载具拖到这里</span> : null}
              {board.unrankedCardIds.map((cardId) => renderCard(cardId, VEHICLE_RANKER_UNRANKED_ID))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
