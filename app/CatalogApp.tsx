"use client";

import {
  ChevronRight,
  CircleAlert,
  Clock3,
  CloudFog,
  Database,
  ExternalLink,
  HeartPulse,
  HelpCircle,
  KeyRound,
  Search,
  Shield,
  Target,
  Ticket,
  User,
  Users,
  Waves,
  Wind,
  Wrench,
  X,
} from "lucide-react";
import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import {
  ICP_RECORD,
  PUBLIC_SECURITY_RECORD,
} from "../lib/public-site-topology.mjs";
import {
  DATA_ACCURACY_NOTICES_DOCUMENT_URL,
  parseDataAccuracyNoticesDocument,
} from "../lib/data-accuracy-notices-document.mjs";
import {
  RUNTIME_DOCUMENT_UPDATED_EVENT,
  isRuntimeDocumentUpdatedEvent,
} from "../lib/runtime-document-events";
import {
  ALL_CATALOG_GROUPS,
  DEFAULT_VIEWER_NAVIGATION_STATE,
  buildCatalogUrl,
  parseCatalogLocation,
} from "../lib/catalog-navigation.mjs";
import { visibleDamageResistanceOverrides } from "../lib/encyclopedia-damage-resistances";
import { formatZoomLevel } from "../lib/reference-display.mjs";
import { vehicleDamageTypeIconKindForPath } from "../lib/vehicle-damage-type-icons";
import {
  loadWikiVehicleFactionMechanics,
  wikiAssetUrl,
} from "../lib/wiki-source";
import { weaponDisplayNameZh } from "../lib/weapon-display-name";
import type {
  CatalogRecord,
  CatalogSearchRecord,
  CatalogSearchVariant,
  CatalogVariant,
  PublicCatalogIndex,
  PublicFactionCatalog,
  ReferenceData,
  ReferenceWeapon,
} from "./catalog-types";
import {
  buildFactionCatalogFromWiki,
  mergeWikiVehicleFactionMechanics,
  wikiVehicleFactionIdsForGroup,
} from "./wiki-vehicle-catalog";
import {
  loadInitialPublicCatalog,
  loadPublicCatalog,
  loadPublicCatalogGroup,
} from "./catalog-bootstrap";
import {
  normalizeVehicleSearch,
  rankVehicleSearch,
  rankVehicleVariantSearch,
  searchCatalogIndexRecords,
} from "./vehicle-search";
import { groupVehicleCardEntries } from "./vehicle-card-grouping";
import type { CatalogIndexSearchResult } from "./vehicle-search";
import {
  resolveCatalogVehicleCategoryIconAsset,
  resolveVehicleCategoryIconAsset,
} from "./vehicle-category-icons";
import {
  FACTION_IMAGE_ORDER,
  FACTION_VISUAL_ASSETS,
  type FactionVisualAsset,
} from "./international-faction-visuals";
import { DailyActiveDisplay } from "./DailyActiveBeacon";
import { IronRiceHallWordmark } from "./IronRiceHallWordmark";
import { VehicleViewerLoading } from "./VehicleViewerLoading";
import { VehicleDamageTypeIcon } from "./VehicleDamageTypeIcon";
import { VehicleDuelEntryLink } from "./VehicleDuelEntryLink";
import { VehicleRankerEntryLink } from "./VehicleRankerEntryLink";
import { officialVehiclePreviewIssue } from "./vehicle-preview-policy";
import type { ViewerNavigationState } from "./viewer-types";
import { SiteFooterSupporters } from "./SiteFooterSupporters";
import {
  SiteFooterUpdatesModal,
  useSiteUpdates,
} from "./SiteFooterUpdates";
import {
  CHINA_FACTION_IMAGE_ORDER,
  CHINA_FACTION_VISUAL_ASSETS,
  siteEditionBasePath,
  siteEditionProfile,
  type SiteEdition,
} from "./site-edition";

const WikiTurretStationIndicator = lazy(() =>
  import("./TurretLimitsDisplay").then(({ TurretStationIndicator }) => ({
    default: TurretStationIndicator,
  })),
);

const ALL_GROUPS = ALL_CATALOG_GROUPS;
const DONATE_QR_SRC = new URL("../donateQR.jpg", import.meta.url).href;
const FEEDBACK_FORM_URL = "https://docs.qq.com/form/page/DRnd4bWtKUGNnT3Vu";

function HomepageUtilityNav({
  siteEdition,
  switchHref,
  switchLabel,
}: {
  siteEdition: SiteEdition;
  switchHref: string;
  switchLabel: string;
}) {
  return (
    <nav className="homepage-utility-nav" aria-label="站点与载具工具">
      <a className="homepage-utility-nav__edition" href={switchHref}>
        <ExternalLink size={13} aria-hidden="true" />
        <span>{switchLabel}</span>
      </a>
      <DailyActiveDisplay variant="hero" />
      <VehicleDuelEntryLink siteEdition={siteEdition} />
      <VehicleRankerEntryLink siteEdition={siteEdition} />
    </nav>
  );
}
const EMPTY_FACTION_FOREGROUND_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const FACTION_IMAGE_PRELOADS = new Map<string, Promise<void>>();
const FACTION_DOCK_TITLE_LINES: Record<string, readonly string[]> = {
  神州防御共同体: ["神州防御", "共同体"],
  北极国家联合体: ["北极国家", "联合体"],
  卡维尔盟约国: ["卡维尔", "盟约国"],
};
const FACTION_DOCK_TITLE_SIZE_PROPERTY = "--faction-dock-title-font-size";

function preloadFactionImage(src: string) {
  const cached = FACTION_IMAGE_PRELOADS.get(src);
  if (cached) return cached;
  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = "low";
  image.src = src;
  const preload = image.decode().then(
    () => undefined,
    (reason: unknown) => {
      FACTION_IMAGE_PRELOADS.delete(src);
      throw reason;
    },
  );
  FACTION_IMAGE_PRELOADS.set(src, preload);
  return preload;
}

function fitFactionDockTitle(title: HTMLHeadingElement) {
  title.style.removeProperty(FACTION_DOCK_TITLE_SIZE_PROPERTY);

  const titleStyle = window.getComputedStyle(title);
  const brand = title.parentElement;
  if (!brand || titleStyle.display === "none") return;

  const brandStyle = window.getComputedStyle(brand);
  const horizontalLayout = brandStyle.flexDirection.startsWith("row");
  const wordmark = brand.querySelector<HTMLElement>(".faction-dock__wordmark");
  const gap = Number.parseFloat(brandStyle.columnGap) || 0;
  const availableWidth = Math.max(
    0,
    brand.clientWidth -
      (horizontalLayout ? (wordmark?.getBoundingClientRect().width ?? 0) + gap : 0) -
      2,
  );
  const contentWidth = Array.from(title.children).reduce(
    (widest, child) => Math.max(widest, child instanceof HTMLElement ? child.scrollWidth : 0),
    0,
  );
  const baseFontSize = Number.parseFloat(titleStyle.fontSize);
  if (!availableWidth || !contentWidth || !baseFontSize || contentWidth <= availableWidth) return;

  const fittedFontSize = Math.max(
    6,
    Math.floor((baseFontSize * availableWidth / contentWidth) * 10) / 10,
  );
  title.style.setProperty(FACTION_DOCK_TITLE_SIZE_PROPERTY, `${fittedFontSize}px`);
}

interface CatalogCardEntry {
  cardId: string;
  alias: string | null;
  data: ReferenceData | null;
  record: CatalogRecord;
  variant: CatalogVariant | null;
}

interface CatalogCardGroup {
  groupId: string;
  entries: CatalogCardEntry[];
  record: CatalogRecord;
}

interface VisibleCatalogCardGroup extends CatalogCardGroup {
  displayCard: CatalogCardEntry;
}

function catalogRecordFromSearchRecord(record: CatalogSearchRecord): CatalogRecord {
  return {
    promoEntryId: record.promoEntryId,
    wikiSourceCardId: record.wikiSourceCardId,
    promotionOrder: record.promotionOrder,
    searchTerms: record.searchTerms,
    searchAliases: record.searchAliases,
    official: record.official,
    mapping: { selectedRawName: record.selectedRawName },
    data: null,
    variants: record.variants.map((variant) => ({
      sourceRawName: variant.sourceRawName,
      catalogBindingRef: variant.catalogBindingRef,
      vehicleRef: variant.vehicleRef,
      runtimeVehicleRef: variant.runtimeVehicleRef,
      visualArtifactRef: variant.visualArtifactRef,
      alias: variant.alias,
      searchTerms: variant.searchTerms,
      searchAliases: variant.searchAliases,
      presentation: variant.presentation,
      thumbnail: null,
      data: null,
    })),
  };
}

function viewerNavigationForVehicle(cardId: string): ViewerNavigationState {
  return {
    ...DEFAULT_VIEWER_NAVIGATION_STATE,
    attacker: cardId,
  } as ViewerNavigationState;
}

function VehicleCategoryIcon({ iconId }: { iconId: string }) {
  const assetId = resolveVehicleCategoryIconAsset(iconId);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny decorative category icon uses a local static path
    <img
      src={`/images/game-ui/vehicle-categories/${assetId}.webp`}
      alt=""
      aria-hidden="true"
      decoding="async"
    />
  );
}

function catalogCardEntries(record: CatalogRecord): CatalogCardEntry[] {
  if (record.variants.length === 0) {
    return [{ cardId: record.promoEntryId, alias: null, data: record.data, record, variant: null }];
  }
  return record.variants.map((variant) => ({
    cardId: `${record.promoEntryId}--${variant.sourceRawName
      .replace(/^BP_/, "")
      .toLocaleLowerCase("en")
      .replaceAll("_", "-")}`,
    alias: variant.alias,
    data: variant.data,
    record,
    variant,
  }));
}

function vehiclePresentationName(
  record: Pick<CatalogRecord, "official">,
  variant: Pick<CatalogVariant, "presentation"> | null = null,
) {
  return variant?.presentation?.vehicleNameZh
    ?? record.official.presentation?.vehicleNameZh
    ?? record.official.nameZh;
}

function vehicleConfiguration(
  record: Pick<CatalogRecord, "official">,
  variant: Pick<CatalogVariant, "presentation"> | null,
  fallbackAlias: string | null,
) {
  const variantConfiguration = variant?.presentation
    ? variant.presentation.configurationZh
    : fallbackAlias;
  const configurations = [
    record.official.presentation?.configurationZh,
    variantConfiguration,
  ]
    .filter((value): value is string => Boolean(value));
  return [...new Set(configurations)].join(" · ") || null;
}

function vehicleLivery(variant: Pick<CatalogVariant, "presentation"> | null) {
  return variant?.presentation?.liveryZh ?? null;
}

function catalogCardGroups(record: CatalogRecord): CatalogCardGroup[] {
  return groupVehicleCardEntries(catalogCardEntries(record)).map((group) => ({
    ...group,
    record,
  }));
}

type VehicleTypeLayoutStyle = CSSProperties & {
  "--vehicle-type-span-wide": number;
  "--vehicle-type-span-desktop": number;
  "--vehicle-type-span-tablet": number;
  "--vehicle-type-span-compact": number;
};

function balancedVehicleTypeSpan(cardCount: number, maxColumns: number) {
  const normalizedCount = Math.max(1, cardCount);
  if (normalizedCount <= maxColumns) return normalizedCount;
  if (normalizedCount <= maxColumns * 2) return Math.ceil(normalizedCount / 2);
  return maxColumns;
}

function vehicleTypeLayoutStyle(cardCount: number): VehicleTypeLayoutStyle {
  return {
    "--vehicle-type-span-wide": balancedVehicleTypeSpan(cardCount, 5),
    "--vehicle-type-span-desktop": balancedVehicleTypeSpan(cardCount, 4),
    "--vehicle-type-span-tablet": balancedVehicleTypeSpan(cardCount, 3),
    "--vehicle-type-span-compact": balancedVehicleTypeSpan(cardCount, 2),
  };
}

function catalogCardImpression(card: CatalogCardEntry) {
  const thumbnail = card.variant?.thumbnail ?? null;
  return thumbnail ? { ...thumbnail, path: wikiAssetUrl(thumbnail.path) } : null;
}

function catalogCardPreviewIssue(card: CatalogCardEntry) {
  const rawName = card.data?.general.rawName ?? card.record.mapping.selectedRawName;
  return officialVehiclePreviewIssue(rawName);
}

function liverySliceSkew(count: number) {
  if (count <= 2) return 11;
  if (count === 3) return 8;
  return 6;
}

const LIVERY_SLICE_THUMBNAIL_BAND_START = 80;
const LIVERY_SLICE_DETAIL_BOUNDARY_SHIFT = 8;

function liverySliceBoundary(
  index: number,
  count: number,
  thumbnailMode: boolean,
) {
  if (index <= 0) return 0;
  if (index >= count) return 100;
  if (!thumbnailMode) {
    return (index / count) * 100 + LIVERY_SLICE_DETAIL_BOUNDARY_SHIFT;
  }
  return (
    LIVERY_SLICE_THUMBNAIL_BAND_START +
    ((index - 1) / (count - 1)) * (100 - LIVERY_SLICE_THUMBNAIL_BAND_START)
  );
}

function liverySliceIndexAtPosition(
  position: number,
  count: number,
  thumbnailMode: boolean,
) {
  for (let index = 1; index < count; index += 1) {
    if (position < liverySliceBoundary(index, count, thumbnailMode)) return index - 1;
  }
  return Math.max(0, count - 1);
}

function liverySliceClipPath(
  index: number,
  count: number,
  thumbnailMode: boolean,
) {
  const skew = liverySliceSkew(count);
  const left = liverySliceBoundary(index, count, thumbnailMode);
  const right = liverySliceBoundary(index + 1, count, thumbnailMode);
  const topLeft = index === 0 ? 0 : Math.min(100, left + skew);
  const bottomLeft = index === 0 ? 0 : Math.max(0, left - skew);
  const topRight = index === count - 1 ? 100 : Math.min(100, right + skew);
  const bottomRight = index === count - 1 ? 100 : Math.max(0, right - skew);
  return `polygon(${topLeft}% 0, ${topRight}% 0, ${bottomRight}% 100%, ${bottomLeft}% 100%)`;
}

function liveryExpandedClipPath(index: number, count: number) {
  const skew = liverySliceSkew(count);
  const overshoot = 8;
  const topLeft = index === 0 ? 0 : -overshoot;
  const bottomLeft = index === 0 ? 0 : -overshoot - skew * 2;
  const topRight =
    index === count - 1 ? 100 : 100 + overshoot + skew * 2;
  const bottomRight = index === count - 1 ? 100 : 100 + overshoot;
  return `polygon(${topLeft}% 0, ${topRight}% 0, ${bottomRight}% 100%, ${bottomLeft}% 100%)`;
}

function liverySeamClipPath(
  index: number,
  count: number,
  thumbnailMode: boolean,
) {
  const skew = liverySliceSkew(count);
  const center = liverySliceBoundary(index + 1, count, thumbnailMode);
  const halfWidth = 0.5;
  const top = Math.min(100, center + skew);
  const bottom = Math.max(0, center - skew);
  return `polygon(${top - halfWidth}% 0, ${top + halfWidth}% 0, ${bottom + halfWidth}% 100%, ${bottom - halfWidth}% 100%)`;
}

function vehicleDisplayName(
  record: Pick<CatalogRecord, "official">,
  variant: Pick<CatalogVariant, "presentation"> | null,
  fallbackAlias: string | null,
) {
  const name = vehiclePresentationName(record, variant);
  const configuration = vehicleConfiguration(record, variant, fallbackAlias);
  const livery = vehicleLivery(variant);
  return `${name}${configuration ? ` ${configuration}` : ""}${livery ? `（${livery}）` : ""}`;
}

function searchVariantLabel(record: CatalogSearchRecord, variant: CatalogSearchVariant) {
  const vehicleName = variant.presentation?.vehicleNameZh?.trim()
    ? variant.presentation.vehicleNameZh
    : null;
  const variantConfiguration = variant.presentation
    ? variant.presentation.configurationZh
    : variant.alias;
  const configurations = [
    record.official.presentation?.configurationZh,
    variantConfiguration,
  ]
    .filter((value): value is string => Boolean(value));
  const configuration = [...new Set(configurations)].join(" · ");
  const livery = variant.presentation?.liveryZh ?? null;
  return [vehicleName, configuration, livery].filter(Boolean).join(" · ") || "标准型";
}

function searchVariantSummary(variants: CatalogSearchVariant[]) {
  const configurationKeys = new Set(
    variants.map((variant) => {
      if (variant.presentation) {
        return [
          variant.presentation.vehicleNameZh?.trim() ?? "",
          variant.presentation.configurationZh?.trim() ?? "",
        ].join("\u0000");
      }
      return variant.alias?.trim() ?? "";
    }),
  );
  const liveryVariantCount = variants.filter(
    (variant) => Boolean(variant.presentation?.liveryZh),
  ).length;
  const summary = [`${configurationKeys.size} 个配置`];
  if (liveryVariantCount > 1) summary.push(`${liveryVariantCount} 个涂装变体`);
  return summary.join(" · ");
}

interface FactionGroup {
  id: string;
  name: string;
  order: number;
  recordCount: number;
}

function factionVisualAsset(
  group: FactionGroup,
  siteEdition: SiteEdition,
): FactionVisualAsset {
  const assets =
    siteEdition === "china"
      ? CHINA_FACTION_VISUAL_ASSETS
      : FACTION_VISUAL_ASSETS;
  const asset = assets[group.id];
  if (!asset) throw new Error(`Missing faction visual asset for ${group.id}`);
  return asset;
}

function factionCatalogStyle(
  group: FactionGroup | null,
  siteEdition: SiteEdition,
): CSSProperties | undefined {
  if (!group) return undefined;
  return {
    "--faction-catalog-background": `url("${factionVisualAsset(group, siteEdition).catalogBackground}")`,
  } as CSSProperties;
}

function chinaFactionVisualStyle(group: FactionGroup): CSSProperties {
  const asset = CHINA_FACTION_VISUAL_ASSETS[group.id];
  if (!asset) throw new Error(`Missing China faction visual asset for ${group.id}`);
  return {
    "--faction-x": `${(asset.x / 2560) * 100}%`,
    "--faction-y": `${(asset.y / 1440) * 100}%`,
    "--faction-width": `${(asset.width / 2560) * 100}%`,
    "--faction-height": `${(asset.height / 1440) * 100}%`,
  } as CSSProperties;
}
const VehicleViewer = lazy(() => import("./InternationalVehicleViewer"));
const SiteContentAdminModal = lazy(() =>
  import("./SiteContentAdminModal").then(({ SiteContentAdminModal: Modal }) => ({
    default: Modal,
  })),
);

function formatNumber(value: number | null, suffix = "") {
  if (value === null || !Number.isFinite(value)) {
    return <span className="unknown-value" aria-label="暂未获取">—</span>;
  }
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

function formatBoolean(value: boolean | null) {
  if (value === null) return <span className="unknown-value" aria-label="暂未获取">—</span>;
  return value ? "是" : "否";
}

function formatPercent(value: number | null) {
  return value === null ? formatNumber(null) : formatNumber(value * 100, "%");
}

function cleanReferenceName(value: string | null) {
  if (!value) return "—";
  return value
    .replace(/^BP_/, "")
    .replace(/_C$/, "")
    .replaceAll("_", " ");
}

const DAMAGE_TYPE_LABELS: Record<string, string> = {
  BP_AmmoBox_Damage_C: "弹药架",
  BP_BasicHeatDamageType_C: "破甲弹（HEAT）",
  BP_Explosives_Damagetype_C: "爆炸伤害",
  BP_Fragmentation_DamageType_C: "破片伤害",
  BP_HAT_DamageType_C: "重型反坦克武器（HAT）",
  BP_Kinetic_DamageType_C: "动能弹",
  BP_SmallArms_DamageType_C: "轻武器",
  SQBurningDamage: "燃烧伤害",
  SQDamageType_Collision: "碰撞伤害",
  SQDamageType_Thermite: "热辐射",
};

function damageTypeLabel(damageClass: string) {
  return DAMAGE_TYPE_LABELS[damageClass] ?? cleanReferenceName(damageClass);
}

function DamageTypeMark({
  damageClass,
  size = 17,
}: {
  damageClass: string;
  size?: number;
}) {
  const label = damageTypeLabel(damageClass);
  const iconKind = vehicleDamageTypeIconKindForPath(damageClass);
  return (
    <span
      className="damage-type-mark"
      data-damage-type-kind={iconKind ?? undefined}
      title={label}
    >
      {iconKind ? <VehicleDamageTypeIcon kind={iconKind} size={size} /> : null}
      <span>{label}</span>
    </span>
  );
}

function damageBarStyle(value: number | null) {
  const amount = value === null ? 0 : Math.max(value, 0);
  const scale = amount > 1 ? amount : 1;
  return {
    "--damage-base": `${(Math.min(amount, 1) / scale) * 100}%`,
    "--damage-over": `${(Math.max(amount - 1, 0) / scale) * 100}%`,
  } as CSSProperties;
}

function damageResistanceSummary(value: number | null) {
  if (value === null) return "数据未知";
  const percent = (amount: number) => new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 1,
  }).format(amount * 100);
  if (value <= 0) return "完全免疫";
  if (value < 1) return `减伤 ${percent(1 - value)}%`;
  if (Math.abs(value - 1) < 0.001) return "承受完整伤害";
  return `额外承伤 ${percent(value - 1)}%`;
}

function resourceLevelStyle(current: number | null, capacity: number | null) {
  const level = current === null || capacity === null || capacity <= 0
    ? 0
    : Math.min(Math.max((current / capacity) * 100, 0), 100);
  return { "--resource-level": `${level}%` } as CSSProperties;
}

function componentDisplayName(component: ReferenceData["components"][number]) {
  const name = cleanReferenceName(component.displayName);
  if (/(wheel|tire)/i.test(name)) return "轮子";
  if (/track/i.test(name)) return "履带";
  if (/(tail.*(?:engine|rotor)|(?:engine|rotor).*tail)/i.test(name)) return "尾桨";
  if (/(main.*rotor|rotor.*main)/i.test(name)) return "主桨";
  if (/rotor/i.test(name)) return "旋翼";
  if (/engine/i.test(name)) return "引擎";
  if (/(ammo|ammunition)/i.test(name)) return "弹药架";
  return name;
}

function weaponDamage(weapon: ReferenceWeapon) {
  if (weapon.projectile.impactDamage !== null && weapon.projectile.impactDamage >= 0) {
    return weapon.projectile.impactDamage;
  }
  if (weapon.projectile.explosiveBaseDamage !== null && weapon.projectile.explosiveBaseDamage > 0) {
    return weapon.projectile.explosiveBaseDamage;
  }
  return weapon.maxDamageToApply;
}

function isOtherEquipment(weapon: ReferenceWeapon) {
  const signature = `${weapon.displayName} ${weapon.gunName} ${weapon.projectileName ?? ""}`.toLocaleLowerCase("en");
  return /(smoke|countermeasure|flare|blank)/.test(signature);
}

function equipmentDisplayName(weapon: ReferenceWeapon) {
  const signature = `${weapon.displayName} ${weapon.gunName}`.toLocaleLowerCase("en");
  if (signature.includes("smoke generator")) return "烟雾发生器";
  if (signature.includes("40mm smoke")) return "40mm 烟雾弹发射器";
  return weapon.displayName || weapon.gunName;
}

function equipmentPositionLabel(
  equipment: ReferenceWeapon,
  seats: ReferenceData["seats"],
) {
  const signature = `${equipment.displayName} ${equipment.gunName}`.toLocaleLowerCase("en");
  if (equipment.turretName) {
    const seat = seats.find((candidate) => candidate.turretName === equipment.turretName);
    if (seat) return `${seatRoleLabel(seat.role)} · F${seat.index}`;
    return `挂点 · ${cleanReferenceName(equipment.turretName)}`;
  }
  if (/(driver|驾驶员)/i.test(signature)) return "驾驶员";
  if (signature.includes("smoke generator")) return "车体烟雾系统";
  return "车体";
}

function equipmentUsageDisplay(equipment: ReferenceWeapon) {
  const signature = `${equipment.displayName} ${equipment.gunName} ${equipment.projectileName ?? ""}`
    .toLocaleLowerCase("en");
  const continuous = signature.includes("smoke generator");
  const totalUnits = equipment.magSize !== null && equipment.numberOfMags !== null
    ? equipment.magSize * equipment.numberOfMags
    : equipment.magSize ?? equipment.numberOfMags;
  const number = (value: number) => new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 1,
  }).format(value);

  if (continuous) {
    const secondsPerUnit = equipment.mechanics.timeBetweenShotsSeconds &&
      equipment.mechanics.timeBetweenShotsSeconds > 0
      ? equipment.mechanics.timeBetweenShotsSeconds
      : equipment.roundsPerMinute && equipment.roundsPerMinute > 0
        ? 60 / equipment.roundsPerMinute
        : 1;
    const durationSeconds = totalUnits === null ? null : totalUnits * secondsPerUnit;
    const replenishedSeconds = equipment.mechanics.roundsPerRearm;
    return {
      continuous: true,
      quantity: durationSeconds === null ? "时长未知" : `${number(durationSeconds)} 秒`,
      mode: "持续排烟",
      capacityLabel: "最大排烟时长",
      chartLabel: durationSeconds === null ? "排烟时长未知" : `可持续排烟 ${number(durationSeconds)} 秒`,
      segments: 10,
      cycleLabel: "启动时间",
      cycleSeconds: equipment.mechanics.equipDurationSeconds,
      replenishAmount: replenishedSeconds === null
        ? "—"
        : `${number(replenishedSeconds)} 秒用量 / 次`,
    };
  }

  const uses = totalUnits;
  const replenishedUses = equipment.mechanics.rearmByRounds
    ? equipment.mechanics.roundsPerRearm
    : equipment.mechanics.rearmOneMagazineAtATime
      ? equipment.magSize
      : totalUnits;
  return {
    continuous: false,
    quantity: uses === null ? "次数未知" : `${number(uses)} 次`,
    mode: "齐射投放",
    capacityLabel: "可用烟幕",
    chartLabel: uses === null ? "烟幕次数未知" : `可释放 ${number(uses)} 次烟幕`,
    segments: Math.max(1, Math.min(Math.round(uses ?? 1), 10)),
    cycleLabel: "释放间隔",
    cycleSeconds: equipment.mechanics.timeBetweenShotsSeconds,
    replenishAmount: replenishedUses === null
      ? "—"
      : `${number(replenishedUses)} 次 / 组`,
  };
}

function weaponStationRepairLimit(
  seat: ReferenceData["seats"][number],
  vehicleRepairLimit: number | null,
) {
  if (seat.seatHealth === null || seat.seatHealth <= 0) return null;
  if (seat.repairToolLimit !== null && seat.repairToolLimit > 0) {
    return seat.repairToolLimit;
  }
  if (seat.repairToolLimit === 0 && vehicleRepairLimit !== null && vehicleRepairLimit > 0) {
    return vehicleRepairLimit;
  }
  return null;
}

function missileGuidanceDisplay(weapon: ReferenceWeapon) {
  const signature = `${weapon.displayName} ${weapon.gunName} ${weapon.projectileName ?? ""}`
    .toLocaleLowerCase("en");
  const isMissile = /(guided missile|\batgm\b|\btow\b|konkurs|refleks|lahat|hj[-_ ]?(?:73c|8l)|aps(?:03|201))/
    .test(signature);
  if (!isMissile) return null;

  if (/\blahat\b/.test(signature)) {
    return {
      label: "半主动激光寻的",
      title: "弹体寻的器追踪目标反射的激光光斑",
    };
  }
  if (/(9m113|konkurs|\btow\b|hj[-_ ]?(?:73c|8l))/.test(signature)) {
    return {
      label: "有线指令 · SACLOS",
      title: "瞄准线半自动指令制导，通过导线向弹体传输修正指令",
    };
  }
  if (/(9m119m|refleks|aps03|aps201)/.test(signature)) {
    return {
      label: "激光驾束 · SACLOS",
      title: "瞄准线半自动指令制导，弹体沿编码激光束飞行",
    };
  }
  return {
    label: "制导方式待确认",
    title: "当前公开数据没有足够信息确认制导方式",
  };
}

function rearmAmountLabel(weapon: ReferenceWeapon) {
  if (weapon.mechanics.rearmByRounds) {
    return weapon.mechanics.roundsPerRearm === null
      ? "按发"
      : `${weapon.mechanics.roundsPerRearm} 发`;
  }
  if (weapon.mechanics.rearmOneMagazineAtATime) return "1 组";
  return "整套";
}

function AmmunitionIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 7.5h12l5 4.5-5 4.5h-12z" />
      <path d="M7 7.5v9" />
    </svg>
  );
}

function weaponAmmoDisplay(weapon: ReferenceWeapon) {
  const magSize = weapon.magSize;
  const magCount = weapon.numberOfMags;
  if (magSize === null && magCount === null) {
    return { label: "备弹未知", title: "备弹与供弹方式未知" };
  }

  const signature = `${weapon.displayName} ${weapon.gunName} ${weapon.projectileName ?? ""}`
    .toLocaleLowerCase("en");
  const isRocketPod = /(s5 rockets?|rocket pod|ub32)/.test(signature);
  const isMissile = /(guided missile|\batgm\b|\btow\b|konkurs|refleks|lahat|hj-?\d)/.test(signature);
  const isDrumFed = /qlz-?87/.test(signature);
  const isBeltFed = /(machine gun|\bcoax\b|crows|\brws\b|\bhmg\b|m240|m2a1|m2hb|m85|\bpkt\b|\bpkp\b|mg3|qjy|qjz|kord|nsv|kpvt|mk19|ags-?17|2a42|2a72|zpt-?99|m252|25mm|30mm)/.test(signature);
  const unit = isMissile || isRocketPod ? "枚" : "发";

  let quantity: string;
  let quantityDescription: string;
  if (magSize === 1 && magCount !== null) {
    quantity = `${magCount} ${unit}`;
    quantityDescription = `共 ${magCount} ${unit}`;
  } else if (magSize !== null && magCount !== null && magCount > 1) {
    quantity = `${magSize} × ${magCount}`;
    quantityDescription = `每组 ${magSize} ${unit}，共 ${magCount} 组`;
  } else if (magSize !== null) {
    quantity = `${magSize} ${unit}`;
    quantityDescription = `共 ${magSize} ${unit}`;
  } else {
    quantity = `${magCount} 组`;
    quantityDescription = `共 ${magCount} 组`;
  }

  let feedLabel: string;
  if (magSize === 1) feedLabel = "单发供弹";
  else if (isRocketPod) feedLabel = "火箭巢";
  else if (isMissile) feedLabel = "发射架供弹";
  else if (isDrumFed) feedLabel = "弹鼓供弹";
  else if (isBeltFed) feedLabel = "弹链供弹";
  else if (magCount !== null && magCount > 1) feedLabel = "弹匣供弹";
  else feedLabel = "弹仓供弹";

  return {
    label: `${quantity} · ${feedLabel}`,
    title: `${quantityDescription}，${feedLabel}`,
  };
}

function hasDistinctDryReload(weapon: ReferenceWeapon) {
  const tactical = weapon.tacticalReloadDurationSeconds;
  const dry = weapon.dryReloadDurationSeconds;
  if (dry === null) return false;
  if (tactical === null) return true;
  return Math.abs(dry - tactical) > 0.01;
}

function seatRoleLabel(role: ReferenceData["seats"][number]["role"]) {
  if (role === "driver") return "驾驶员";
  if (role === "machine-gunner") return "机枪手";
  if (role === "grenadier") return "榴弹手";
  if (role === "missile-operator") return "导弹手";
  if (role === "rocket-operator") return "火箭手";
  if (role === "commander") return "车长";
  if (role === "gunner") return "炮手";
  return "乘员";
}

const FACTION_DUST_PARTICLES = [
  { x: 7, y: 82, size: 2.2, dx: 78, dy: -24, mx: 29, my: -4, duration: 1840, delay: -1160, blur: 0.2, opacity: 0.76, rotation: 118 },
  { x: 13, y: 66, size: 1.3, dx: 102, dy: -11, mx: 38, my: -9, duration: 2360, delay: -370, blur: 0, opacity: 0.58, rotation: 244 },
  { x: 19, y: 91, size: 3.1, dx: 64, dy: -38, mx: 21, my: -15, duration: 2110, delay: -1740, blur: 0.5, opacity: 0.68, rotation: 167 },
  { x: 26, y: 74, size: 1.8, dx: 93, dy: -29, mx: 34, my: -3, duration: 1570, delay: -620, blur: 0.1, opacity: 0.82, rotation: 291 },
  { x: 32, y: 87, size: 2.5, dx: 119, dy: -18, mx: 47, my: -13, duration: 2780, delay: -2020, blur: 0.6, opacity: 0.54, rotation: 203 },
  { x: 38, y: 59, size: 1.1, dx: 72, dy: -44, mx: 19, my: -21, duration: 1930, delay: -950, blur: 0, opacity: 0.7, rotation: 326 },
  { x: 43, y: 79, size: 3.4, dx: 86, dy: -9, mx: 31, my: 2, duration: 2440, delay: -1430, blur: 0.8, opacity: 0.48, rotation: 142 },
  { x: 49, y: 94, size: 1.6, dx: 108, dy: -34, mx: 42, my: -17, duration: 1680, delay: -230, blur: 0.2, opacity: 0.84, rotation: 277 },
  { x: 55, y: 69, size: 2.8, dx: 57, dy: -51, mx: 16, my: -26, duration: 2260, delay: -1870, blur: 0.4, opacity: 0.62, rotation: 194 },
  { x: 61, y: 85, size: 1.2, dx: 126, dy: -22, mx: 52, my: -5, duration: 2620, delay: -780, blur: 0, opacity: 0.72, rotation: 351 },
  { x: 66, y: 62, size: 2.1, dx: 81, dy: -36, mx: 27, my: -20, duration: 1740, delay: -1320, blur: 0.3, opacity: 0.8, rotation: 129 },
  { x: 71, y: 92, size: 3.6, dx: 98, dy: -14, mx: 39, my: -10, duration: 2870, delay: -410, blur: 0.9, opacity: 0.46, rotation: 218 },
  { x: 76, y: 77, size: 1.5, dx: 68, dy: -47, mx: 18, my: -28, duration: 2050, delay: -2190, blur: 0.1, opacity: 0.77, rotation: 312 },
  { x: 81, y: 56, size: 2.4, dx: 115, dy: -27, mx: 49, my: -8, duration: 2490, delay: -1080, blur: 0.5, opacity: 0.56, rotation: 181 },
  { x: 85, y: 88, size: 1, dx: 89, dy: -42, mx: 36, my: -23, duration: 1510, delay: -560, blur: 0, opacity: 0.88, rotation: 263 },
  { x: 89, y: 70, size: 3, dx: 61, dy: -19, mx: 22, my: -1, duration: 2710, delay: -1610, blur: 0.7, opacity: 0.5, rotation: 153 },
  { x: 93, y: 95, size: 1.9, dx: 104, dy: -31, mx: 44, my: -16, duration: 2190, delay: -290, blur: 0.2, opacity: 0.74, rotation: 337 },
  { x: 97, y: 80, size: 2.6, dx: 75, dy: -54, mx: 24, my: -31, duration: 2320, delay: -1950, blur: 0.4, opacity: 0.64, rotation: 226 },
] as const;

function stationKindLabel(
  stationKind: ReferenceData["seats"][number]["stationKind"],
) {
  if (stationKind === "remote-weapon-station") return "遥控武器站";
  if (stationKind === "observation-station") return "观瞄席";
  if (stationKind === "weapon-station") return "武器站";
  return null;
}

function requiresVehicleKit(seat: ReferenceData["seats"][number]) {
  return seat.kitRequirement !== null && seat.kitRequirement !== "Light Vehicle";
}

const factionCatalogRequests = new Map<string, Promise<PublicFactionCatalog>>();

function requestFactionCatalog(
  groupId: string,
  expectedIndex: PublicCatalogIndex,
  siteEdition: SiteEdition,
) {
  const requestKey = `${siteEdition}\u0000${expectedIndex.catalogId}\u0000${groupId}`;
  const existing = factionCatalogRequests.get(requestKey);
  if (existing) return existing;
  const factionIds = wikiVehicleFactionIdsForGroup(expectedIndex, groupId);
  const request = Promise.all(
    factionIds.map((factionId) => loadWikiVehicleFactionMechanics(factionId)),
  )
    .then((values) =>
      buildFactionCatalogFromWiki(
        mergeWikiVehicleFactionMechanics(values),
        expectedIndex,
        groupId,
        siteEdition,
      ),
    )
    .catch((error) => {
      factionCatalogRequests.delete(requestKey);
      throw error;
    });
  factionCatalogRequests.set(requestKey, request);
  return request;
}

function VehicleCard({
  card,
  siteEdition,
  liveryOptions,
  selected,
  thumbnailMode,
  encyclopediaOpen,
  typeHeading,
  vehicleType,
  typeGap,
  onSelect,
  onToggleEncyclopedia,
  buttonRef,
}: {
  card: CatalogCardEntry;
  siteEdition: SiteEdition;
  liveryOptions: CatalogCardEntry[];
  selected: boolean;
  thumbnailMode: boolean;
  encyclopediaOpen: boolean;
  typeHeading?: string | null;
  vehicleType?: string | null;
  typeGap?: boolean;
  onSelect: (card: CatalogCardEntry) => void;
  onToggleEncyclopedia: () => void;
  buttonRef: (cardId: string, node: HTMLButtonElement | null) => void;
}) {
  const sliceRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [hoveredLiveryCardId, setHoveredLiveryCardId] = useState<string | null>(null);
  const hasLiveryOptions = liveryOptions.length > 1;
  const { alias, cardId, data, record, variant } = card;
  const expandedLiveryCardId = selected ? card.cardId : hoveredLiveryCardId;
  const general = data?.general ?? null;
  const categoryIconId = resolveCatalogVehicleCategoryIconAsset({
    cardId,
    promoEntryId: record.promoEntryId,
  });
  const cardName = vehiclePresentationName(record, variant);
  const cardConfiguration = vehicleConfiguration(record, variant, alias);
  const cardVariantName = cardConfiguration?.replace(/\s*·\s*/g, " ") ?? null;
  const cardDisplayName = vehicleDisplayName(record, variant, alias);
  const previewIssue = catalogCardPreviewIssue(card);
  const crewSeatCount = general?.crewSeatCount ?? null;
  const totalSeatCount = general?.totalSeatCount ?? null;
  const passengerSeatCount =
    crewSeatCount !== null && totalSeatCount !== null
      ? Math.max(0, totalSeatCount - crewSeatCount)
      : null;
  const seatCount =
    crewSeatCount !== null && passengerSeatCount !== null
      ? `${crewSeatCount}/${passengerSeatCount}`
      : <span className="unknown-value" aria-label="暂未获取">—</span>;

  const renderImpression = (entry: CatalogCardEntry) => {
    const impression = catalogCardImpression(entry);
    if (!impression) return null;
    const rawName =
      entry.data?.general.rawName ?? entry.record.mapping.selectedRawName;
    const impressionAlignment =
      siteEdition === "china" && rawName === "BP_ZBD04A"
        ? "zvb4a-woodland"
        : undefined;
    return (
      // Product-owned WebP; Next Image would add a runtime optimizer to the static path.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="vehicle-card__impression"
        data-impression-alignment={impressionAlignment}
        src={impression.path}
        width={impression.width}
        height={impression.height}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        draggable={false}
      />
    );
  };

  const identity = (
    <span className="vehicle-card__identity">
      <span
        className="vehicle-card__type"
        data-icon={categoryIconId ?? "unmapped"}
        aria-label={
          record.official.typeZh +
          (categoryIconId ? "" : "，图标待补充") +
          (general?.amphibious ? "，支持两栖" : "")
        }
        title={record.official.typeZh + (general?.amphibious ? " · 支持两栖" : "")}
      >
        {categoryIconId ? (
          <VehicleCategoryIcon iconId={categoryIconId} />
        ) : (
          <span className="vehicle-card__category-icon-missing" aria-hidden="true">
            ?
          </span>
        )}
        {general?.amphibious ? (
          <Waves className="vehicle-card__amphibious" size={13} aria-hidden="true" />
        ) : null}
      </span>
      <span
        className="vehicle-card__label"
        data-variant={cardVariantName ? "true" : undefined}
      >
        <span className="vehicle-card__name-row">
          <span className="vehicle-card__name">{cardName}</span>
        </span>
        <span
          className="vehicle-card__alias"
          aria-hidden={cardVariantName ? undefined : true}
          title={cardVariantName ?? undefined}
        >
          {cardVariantName ?? "\u00a0"}
        </span>
      </span>
    </span>
  );

  const stats = (
    <span className="vehicle-card__stats">
      <span className="vehicle-card__stat" aria-label={"血量 " + (general?.vehicleHealth ?? "暂未获取")}>
        <HeartPulse size={16} aria-hidden="true" />
        <strong>{formatNumber(general?.vehicleHealth ?? null)}</strong>
      </span>
      <span className="vehicle-card__stat" aria-label={"票数 " + (general?.ticketValue ?? "暂未获取")}>
        <Ticket size={16} aria-hidden="true" />
        <strong>{formatNumber(general?.ticketValue ?? null)}</strong>
      </span>
      <span
        className="vehicle-card__stat"
        aria-label="组员/乘员"
        title="组员 / 乘员"
      >
        <Users size={16} aria-hidden="true" />
        <strong>{seatCount}</strong>
      </span>
    </span>
  );
  const previewNotice = previewIssue ? (
    <span
      className="vehicle-card__preview-notice"
      role="note"
      data-preview-issue={previewIssue.code}
      title={previewIssue.message}
    >
      <CircleAlert size={17} strokeWidth={1.8} aria-hidden="true" />
      <span>{previewIssue.message}</span>
    </span>
  ) : null;

  return (
    <li
      className="vehicle-card-shell"
      data-multi-livery={hasLiveryOptions ? "true" : undefined}
      data-vehicle-type={vehicleType ? "true" : undefined}
      data-vehicle-type-start={typeHeading ? "true" : undefined}
      data-vehicle-type-gap={typeGap ? "true" : undefined}
    >
      {typeHeading ? (
        <span className="vehicle-type-heading vehicle-type-heading--card" aria-hidden="true">
          {typeHeading}
        </span>
      ) : null}
      {hasLiveryOptions ? (
        <div
          className="vehicle-card vehicle-card--split"
          data-livery-expanded={expandedLiveryCardId ? "true" : undefined}
          data-selected={selected ? "true" : undefined}
          data-thumbnail-mode={thumbnailMode ? "true" : undefined}
          data-promo-entry={record.promoEntryId}
          data-card-group={record.promoEntryId}
          role="group"
          aria-label={[
            cardName,
            cardVariantName,
            liveryOptions.length + " 种涂装变体",
          ].filter(Boolean).join("，")}
          onPointerMove={(event) => {
            if (
              selected ||
              hoveredLiveryCardId !== null ||
              event.pointerType === "touch"
            ) return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
            const diagonalOffset =
              liverySliceSkew(liveryOptions.length) * (1 - y * 2);
            const sourceX = x - diagonalOffset;
            const nextIndex = liverySliceIndexAtPosition(
              sourceX,
              liveryOptions.length,
              thumbnailMode,
            );
            setHoveredLiveryCardId(liveryOptions[nextIndex]?.cardId ?? null);
          }}
          onPointerLeave={() => setHoveredLiveryCardId(null)}
          onBlurCapture={(event) => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
              setHoveredLiveryCardId(null);
            }
          }}
        >
          <span className="vehicle-card__livery-slices">
            {liveryOptions.map((option, index) => {
              const optionSelected = selected && option.cardId === card.cardId;
              const optionActive = option.cardId === expandedLiveryCardId;
              const optionDisplayName = vehicleDisplayName(
                option.record,
                option.variant,
                option.alias,
              );
              return (
                <button
                  key={option.cardId}
                  ref={(node) => {
                    sliceRefs.current[index] = node;
                    buttonRef(option.cardId, node);
                  }}
                  className="vehicle-card__livery-slice"
                  type="button"
                  aria-label={optionDisplayName + "，查看载具详情"}
                  aria-current={optionSelected ? "true" : undefined}
                  aria-hidden={expandedLiveryCardId && !optionActive ? true : undefined}
                  tabIndex={expandedLiveryCardId ? (optionActive ? 0 : -1) : 0}
                  data-active={optionActive ? "true" : undefined}
                  data-promo-entry={option.record.promoEntryId}
                  data-card-entry={option.cardId}
                  data-livery-slice={index + 1}
                  style={{
                    "--vehicle-card-livery-clip": liverySliceClipPath(
                      index,
                      liveryOptions.length,
                      thumbnailMode,
                    ),
                    "--vehicle-card-livery-expanded-clip":
                      liveryExpandedClipPath(index, liveryOptions.length),
                  } as CSSProperties}
                  onPointerEnter={(event) => {
                    if (!selected && event.pointerType !== "touch") {
                      setHoveredLiveryCardId(option.cardId);
                    }
                  }}
                  onFocus={() => {
                    if (!selected) setHoveredLiveryCardId(option.cardId);
                  }}
                  onClick={() => {
                    setHoveredLiveryCardId(null);
                    onSelect(option);
                  }}
                  onKeyDown={(event) => {
                    let nextIndex: number | null = null;
                    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                      nextIndex = (index + 1) % liveryOptions.length;
                    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                      nextIndex = (index - 1 + liveryOptions.length) % liveryOptions.length;
                    } else if (event.key === "Home") {
                      nextIndex = 0;
                    } else if (event.key === "End") {
                      nextIndex = liveryOptions.length - 1;
                    }
                    if (nextIndex === null) return;
                    event.preventDefault();
                    sliceRefs.current[nextIndex]?.focus();
                  }}
                >
                  {renderImpression(option)}
                </button>
              );
            })}
          </span>
          {liveryOptions.slice(0, -1).map((option, index) => (
            <span
              key={option.cardId + "-seam"}
              className="vehicle-card__livery-seam"
              aria-hidden="true"
              style={{
                clipPath: liverySeamClipPath(
                  index,
                  liveryOptions.length,
                  thumbnailMode,
                ),
              }}
            />
          ))}
          {previewNotice}
          {identity}
          {stats}
        </div>
      ) : (
        <button
          ref={(node) => buttonRef(card.cardId, node)}
          type="button"
          className="vehicle-card"
          aria-current={selected ? "true" : undefined}
          onClick={() => onSelect(card)}
          data-promo-entry={record.promoEntryId}
          data-card-entry={card.cardId}
        >
          {renderImpression(card)}
          {previewNotice}
          {identity}
          {stats}
          <ChevronRight className="vehicle-card__arrow" size={19} aria-hidden="true" />
        </button>
      )}
      <button
        className="vehicle-card__encyclopedia"
        type="button"
        aria-label={cardDisplayName + "载具百科"}
        aria-expanded={encyclopediaOpen}
        aria-controls={"vehicle-encyclopedia-" + card.cardId}
        data-open={encyclopediaOpen}
        title="载具百科"
        onClick={onToggleEncyclopedia}
      >
        <HelpCircle size={19} aria-hidden="true" />
      </button>
    </li>
  );
}

function ReferenceDataView({ data }: { data: ReferenceData | null }) {
  type EquipmentResolver = typeof import("./runtime-vehicle-equipment")["runtimeVehicleEquipmentBindingForId"];
  const [equipmentResolver, setEquipmentResolver] = useState<EquipmentResolver | null>(null);
  const [equipmentLoadError, setEquipmentLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!data || data.weaponBindingIds.length === 0 || equipmentResolver) return undefined;
    let cancelled = false;
    void import("./runtime-vehicle-equipment")
      .then(({ runtimeVehicleEquipmentBindingForId }) => {
        if (cancelled) return;
        setEquipmentResolver(() => runtimeVehicleEquipmentBindingForId);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setEquipmentLoadError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [data, equipmentResolver]);

  if (!data) {
    return (
      <div className="reference-empty">
        <CircleAlert size={20} aria-hidden="true" />
        <div>
          <strong>详细参数暂未整理</strong>
          <p>当前先展示载具名称与武器站变体。</p>
        </div>
      </div>
    );
  }

  const {
    general,
    weaponBindingIds,
    seats,
    components,
    damageResistances,
  } = data;
  if (weaponBindingIds.length > 0 && equipmentLoadError) {
    return (
      <div className="reference-empty" role="alert">
        <CircleAlert size={20} aria-hidden="true" />
        <div>
          <strong>武器资料载入失败</strong>
          <p>{equipmentLoadError}</p>
        </div>
      </div>
    );
  }
  if (weaponBindingIds.length > 0 && !equipmentResolver) {
    return (
      <div className="reference-empty" role="status">
        <Clock3 size={20} aria-hidden="true" />
        <div>
          <strong>正在载入载具百科</strong>
          <p>武器和部件资料将在展开时按需读取。</p>
        </div>
      </div>
    );
  }
  const weapons = weaponBindingIds.map((bindingId) => {
    const binding =
      equipmentResolver?.(bindingId);
    if (!binding) {
      throw new Error(
        `Vehicle reference data points to missing weapon binding ${bindingId}`,
      );
    }
    return binding.equipment;
  });
  const visibleHullDamageResistances =
    visibleDamageResistanceOverrides(damageResistances);
  const weaponEquipment = weapons.filter((weapon) => !isOtherEquipment(weapon));
  const otherEquipment = weapons.filter(isOtherEquipment);
  const specialSeats = seats.filter((seat) => seat.role !== "passenger");
  const passengerCount = seats.length - specialSeats.length;
  const armedTurretNames = new Set(
    weaponEquipment
      .map((weapon) => weapon.turretName)
      .filter((turretName): turretName is string => turretName !== null),
  );
  const armedSeats = seats.filter(
    (seat) => seat.turretName !== null && armedTurretNames.has(seat.turretName),
  );
  const hasBreakableWeaponStation = armedSeats.some(
    (seat) => seat.seatHealth !== null && seat.seatHealth > 0,
  );
  const componentGroups = Array.from(
    components.reduce((groups, component) => {
      const label = componentDisplayName(component);
      const key = [
        label,
        component.componentHealth,
        component.repairToolLimit,
        component.canBeRepairedAfterDestroy,
        JSON.stringify(component.damageResistances),
      ].join("|");
      const group = groups.get(key);
      if (group) {
        group.count += 1;
      } else {
        groups.set(key, { key, label, component, count: 1 });
      }
      return groups;
    }, new Map<string, {
      key: string;
      label: string;
      component: ReferenceData["components"][number];
      count: number;
    }>()),
  ).map(([, group]) => group);
  const constructionCapacity = general.hasConstruction === false ? 0 : general.totalResources;
  const ammoCapacity = general.totalResources;

  return (
    <>
      {general.details ? <p className="wiki-description">{general.details}</p> : null}

      <div className="stat-grid" aria-label="载具核心参数">
        <div className="stat-cell">
          <HeartPulse size={17} aria-hidden="true" />
          <span>载具耐久</span>
          <strong>{formatNumber(general.vehicleHealth, " HP")}</strong>
        </div>
        <div className="stat-cell">
          <Ticket size={17} aria-hidden="true" />
          <span>票值</span>
          <strong>{formatNumber(general.ticketValue)}</strong>
        </div>
        <div className="stat-cell">
          <Users size={17} aria-hidden="true" />
          <span>成员 / 容量</span>
          <strong>{formatNumber(general.crewSeatCount)} / {formatNumber(general.totalSeatCount)}</strong>
        </div>
        <div className="stat-cell">
          <Wrench size={17} aria-hidden="true" />
          <span>工具箱维修上限</span>
          <strong>{formatPercent(general.repairToolLimit)}</strong>
        </div>
        <div className="stat-cell">
          <Database size={17} aria-hidden="true" />
          <span>弹药资源</span>
          <strong>{formatNumber(general.ammoResources)}</strong>
        </div>
        <div className="stat-cell">
          <Clock3 size={17} aria-hidden="true" />
          <span>重生时间</span>
          <strong>{formatNumber(general.respawnTime, " min")}</strong>
        </div>
        <div className="stat-cell">
          <Ticket size={17} aria-hidden="true" />
          <span>击杀奖励</span>
          <strong>{formatNumber(general.killerPointReward, " pts")}</strong>
        </div>
        <div className="stat-cell">
          <Shield size={17} aria-hidden="true" />
          <span>类型</span>
          <strong>{general.type}</strong>
        </div>
      </div>

      <div className="encyclopedia-columns">
      <div className="data-subsection">
        <div className="subsection-heading">
          <Users size={17} aria-hidden="true" />
          <h4>成员信息</h4>
          <div className="subsection-heading__aside">
            <span className="member-kit-legend" aria-label="装备要求图例">
              <span data-required="true">需载具兵种</span>
              <span data-required="false">无需载具兵种</span>
            </span>
            <span className="subsection-heading__count">{seats.length}</span>
          </div>
        </div>
        <div className="member-distribution" aria-label={`共 ${seats.length} 名成员`}>
          <span className="member-distribution__total">
            <Users size={15} aria-hidden="true" />
            <strong>{seats.length}</strong>
            <small>成员</small>
          </span>
          <div className="member-distribution__roles">
            {specialSeats.map((seat) => (
              <span
                className="member-role"
                data-role={seat.role}
                data-kit-required={requiresVehicleKit(seat)}
                key={seat.index}
              >
                <User size={13} aria-hidden="true" />
                <strong>F{seat.index}</strong>
                {seatRoleLabel(seat.role)}
                {seat.stabilized || seat.zoomLevels.length > 0 ? (
                  <small>
                    {[
                      seat.stabilized ? "稳定器" : null,
                      seat.zoomLevels.length > 0
                        ? seat.zoomLevels.map(formatZoomLevel).join(" / ")
                        : null,
                    ].filter(Boolean).join(" · ")}
                  </small>
                ) : null}
              </span>
            ))}
            {passengerCount > 0 ? (
              <span
                className="member-distribution__passengers"
                aria-label={`${passengerCount} 名普通成员`}
                title={`${passengerCount} 名普通成员`}
              >
                {Array.from({ length: passengerCount }, (_, index) => (
                  <User size={13} aria-hidden="true" key={index} />
                ))}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="data-subsection data-subsection--weapons">
        <div className="subsection-heading">
          <Target size={17} aria-hidden="true" />
          <h4>武器</h4>
          <span>{weaponEquipment.length}</span>
        </div>
        {weaponEquipment.length > 0 ? (
          <ul className="weapon-list">
            {weaponEquipment.map((weapon, index) => {
              const ammoDisplay = weaponAmmoDisplay(weapon);
              const guidanceDisplay = missileGuidanceDisplay(weapon);
              return (
              <li key={`${weapon.gunName}-${index}`}>
                <div className="weapon-list__identity">
                  <div className="weapon-list__title-row">
                    <div className="weapon-list__names">
                      <strong>{weaponDisplayNameZh(weapon)}</strong>
                      <small className="weapon-list__english">{weapon.displayName || weapon.gunName}</small>
                    </div>
                    <div className="weapon-list__summary">
                      {guidanceDisplay ? (
                        <small className="weapon-list__guidance" title={guidanceDisplay.title}>
                          <span>制导</span>
                          <strong>{guidanceDisplay.label}</strong>
                        </small>
                      ) : null}
                      <span className="weapon-list__ammo" title={ammoDisplay.title}>
                        <AmmunitionIcon size={13} />
                        <span>{ammoDisplay.label}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>射速</dt>
                    <dd>{formatNumber(weapon.roundsPerMinute, " RPM")}</dd>
                  </div>
                  <div>
                    <dt>初速</dt>
                    <dd>{formatNumber(weapon.muzzleVelocityMps, " m/s")}</dd>
                  </div>
                  <div>
                    <dt>穿深</dt>
                    <dd>{formatNumber(weapon.armorPenetrationMm, " mm")}</dd>
                  </div>
                  <div>
                    <dt>伤害</dt>
                    <dd>{formatNumber(weaponDamage(weapon))}</dd>
                  </div>
                  <div>
                    <dt title="弹体穿透首个有效命中层后可继续追踪的最大距离">
                      后效距离
                    </dt>
                    <dd>{formatNumber(weapon.traceDistanceAfterPenM, " m")}</dd>
                  </div>
                  <div>
                    <dt>装填时间</dt>
                    <dd>{formatNumber(weapon.tacticalReloadDurationSeconds, " s")}</dd>
                  </div>
                  {hasDistinctDryReload(weapon) ? (
                    <div>
                      <dt>空仓装填</dt>
                      <dd>{formatNumber(weapon.dryReloadDurationSeconds, " s")}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>补弹时间</dt>
                    <dd>{formatNumber(weapon.mechanics.minimumRearmSeconds, " s")}</dd>
                  </div>
                  <div>
                    <dt>单次补弹</dt>
                    <dd>{rearmAmountLabel(weapon)}</dd>
                  </div>
                  <div>
                    <dt>伤害类型</dt>
                    <dd>
                      <DamageTypeMark
                        damageClass={weapon.projectile.damageType ?? ""}
                        size={18}
                      />
                    </dd>
                  </div>
                </dl>
              </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted-copy">该载具没有独立武器条目。</p>
        )}
      </div>

      <div className="data-subsection">
        <div className="subsection-heading">
          <Database size={17} aria-hidden="true" />
          <h4>其他装备</h4>
          <span>{otherEquipment.length}</span>
        </div>
        {otherEquipment.length > 0 ? (
          <ul className="other-equipment-list">
            {otherEquipment.map((equipment, index) => {
              const usage = equipmentUsageDisplay(equipment);
              const positionLabel = equipmentPositionLabel(equipment, seats);
              return (
                <li
                  key={`${equipment.gunName}-${index}`}
                  data-continuous={usage.continuous}
                  data-equipment-location={positionLabel}
                >
                  <div className="other-equipment-list__heading">
                    <div className="other-equipment-list__identity">
                      {usage.continuous ? (
                        <Wind size={17} aria-hidden="true" />
                      ) : (
                        <CloudFog size={17} aria-hidden="true" />
                      )}
                      <div className="other-equipment-list__identity-copy">
                        <strong>{equipmentDisplayName(equipment)}</strong>
                        <small className="other-equipment-list__location">
                          {positionLabel}
                        </small>
                      </div>
                    </div>
                    <div className="other-equipment-list__summary">
                      <strong>{usage.quantity}</strong>
                      <small>{usage.mode}</small>
                    </div>
                  </div>
                  <div className="other-equipment-capacity">
                    <div className="other-equipment-capacity__label">
                      <span>{usage.capacityLabel}</span>
                      <strong>{usage.quantity}</strong>
                    </div>
                    <span
                      className="other-equipment-capacity__track"
                      role="img"
                      aria-label={usage.chartLabel}
                      data-continuous={usage.continuous}
                    >
                      {Array.from({ length: usage.segments }, (_, segment) => (
                        <i key={segment} />
                      ))}
                    </span>
                  </div>
                  <dl className="other-equipment-properties">
                    <div><dt>{usage.cycleLabel}</dt><dd>{formatNumber(usage.cycleSeconds, " s")}</dd></div>
                    <div><dt>补充时间</dt><dd>{formatNumber(equipment.mechanics.minimumRearmSeconds, " s")}</dd></div>
                    <div><dt>单次补充</dt><dd>{usage.replenishAmount}</dd></div>
                  </dl>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted-copy">该载具没有其他独立装备。</p>
        )}
      </div>

      <div className="data-subsection">
        <div className="subsection-heading">
          <Wrench size={17} aria-hidden="true" />
          <h4>载具组件</h4>
          <span>{componentGroups.length}</span>
        </div>
        {componentGroups.length > 0 ? (
          <ul className="component-list">
            {componentGroups.map(({ key, label, component, count }) => {
              const resistanceOverrides = visibleDamageResistanceOverrides(
                component.damageResistances,
              );
              return (
              <li key={key}>
                <strong>
                  {label}
                  {count > 1 ? <span className="component-list__count"> ×{count}</span> : null}
                </strong>
                <dl>
                  <div><dt>耐久</dt><dd>{formatNumber(component.componentHealth, " HP")}</dd></div>
                  <div>
                    <dt>工具箱维修</dt>
                    <dd>
                      {component.canBeRepairedAfterDestroy === null
                        ? formatBoolean(null)
                        : component.canBeRepairedAfterDestroy
                          ? component.repairToolLimit === null
                            ? "可维修"
                            : <>最高修至 {formatPercent(component.repairToolLimit)}</>
                          : "不可维修"}
                    </dd>
                  </div>
                </dl>
                <div className="component-list__resistance">
                  {resistanceOverrides.length > 0 ? (
                    <>
                      <span>组件承伤</span>
                      <div className="component-list__resistance-bars">
                        {resistanceOverrides.map((item) => (
                          <div className="component-list__resistance-row" key={item.damageClass}>
                            <DamageTypeMark
                              damageClass={item.damageClass}
                              size={16}
                            />
                            <span
                              className="resistance-chart__track"
                              aria-hidden="true"
                              style={damageBarStyle(item.modifier)}
                            >
                              <i
                                className="resistance-chart__fill resistance-chart__fill--direct"
                              />
                              <i className="resistance-chart__fill resistance-chart__fill--overflow" />
                            </span>
                            <strong>{formatPercent(item.modifier)}</strong>
                          </div>
                        ))}
                      </div>
                      <small className="component-list__resistance-note" role="note">
                        <CircleAlert size={10} aria-hidden="true" />
                        已配置且承伤为 100% 的类型已省略
                      </small>
                    </>
                  ) : (
                    <small className="component-list__resistance-note" role="note">
                      <CircleAlert size={10} aria-hidden="true" />
                      未配置独立倍率，承伤 100%
                    </small>
                  )}
                </div>
              </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted-copy">该载具没有独立可损伤组件。</p>
        )}
      </div>

      <div className="data-subsection">
        <div className="subsection-heading">
          <Shield size={17} aria-hidden="true" />
          <h4>车体伤害抗性</h4>
          <span>{visibleHullDamageResistances.length}</span>
        </div>
        <div className="resistance-chart" role="list" aria-label="各类伤害的实际承伤比例">
            {visibleHullDamageResistances.map((item, index) => (
                <article className="resistance-chart__item" role="listitem" key={`${item.damageClass}-${index}`}>
                  <header>
                    <h5>
                      <DamageTypeMark
                        damageClass={item.damageClass}
                        size={18}
                      />
                    </h5>
                    <small>{damageResistanceSummary(item.modifier)}</small>
                  </header>
                  <div className="resistance-chart__bars">
                    <div className="resistance-chart__bar-row">
                      <span>实际承伤</span>
                      <span
                        className="resistance-chart__track"
                        aria-hidden="true"
                        style={damageBarStyle(item.modifier)}
                      >
                        <i
                          className="resistance-chart__fill resistance-chart__fill--direct"
                        />
                        <i className="resistance-chart__fill resistance-chart__fill--overflow" />
                      </span>
                      <strong>{formatPercent(item.modifier)}</strong>
                    </div>
                  </div>
                </article>
            ))}
        </div>
        <p className="resistance-chart__note" role="note">
          <CircleAlert size={11} aria-hidden="true" />
          已配置且承伤为 100% 的伤害类型已省略
        </p>
      </div>

      <div className="data-subsection">
        <div className="subsection-heading">
          <Users size={17} aria-hidden="true" />
          <h4>武器站信息</h4>
          <span>{armedSeats.length}</span>
        </div>
        <div className="seat-detail-grid">
          {armedSeats.map((seat) => {
            const fieldRepairLimit = weaponStationRepairLimit(
              seat,
              general.repairToolLimit,
            );
            const stationWeapons = weaponEquipment.filter(
              (weapon) => weapon.turretName === seat.turretName,
            );
            return (
              <article key={seat.index}>
              <header>
                <strong>{seatRoleLabel(seat.role)} (F{seat.index})</strong>
                <div className="seat-detail-grid__tags">
                  {stationKindLabel(seat.stationKind) ? (
                    <span>{stationKindLabel(seat.stationKind)}</span>
                  ) : null}
                  {seat.stabilized ? <span>稳定器</span> : null}
                </div>
              </header>
              <dl>
                <div><dt>席位耐久</dt><dd>{formatNumber(seat.seatHealth, " HP")}</dd></div>
                {fieldRepairLimit !== null ? (
                  <div>
                    <dt>野外维修</dt>
                    <dd>可修至 {formatPercent(fieldRepairLimit)}</dd>
                  </div>
                ) : null}
                <div><dt>倍率</dt><dd>{seat.zoomLevels.length > 0 ? seat.zoomLevels.map(formatZoomLevel).join(" / ") : "—"}</dd></div>
                <div>
                  <dt>装备</dt>
                  <dd>{stationWeapons.map(weaponDisplayNameZh).join(" / ") || cleanReferenceName(seat.turretName)}</dd>
                </div>
                {seat.turret ? (
                  <>
                    <div><dt>最大水平速度</dt><dd>{formatNumber(seat.turret.maxYawSpeed, "°/s")}</dd></div>
                    <div><dt>最大俯仰速度</dt><dd>{formatNumber(seat.turret.maxPitchSpeed, "°/s")}</dd></div>
                  </>
                ) : null}
              </dl>
              {seat.turret ? (
                <Suspense
                  fallback={(
                    <div
                      className="seat-detail-grid__turret-indicator-status"
                      role="status"
                    >
                      正在载入射界指示器…
                    </div>
                  )}
                >
                  <WikiTurretStationIndicator
                    turret={seat.turret}
                    stationLabel={`${seatRoleLabel(seat.role)} F${seat.index}`}
                  />
                </Suspense>
              ) : (
                <p
                  className="seat-detail-grid__turret-indicator-status"
                  role="note"
                >
                  暂无可验证的武器站射界
                </p>
              )}
              </article>
            );
          })}
        </div>
        {hasBreakableWeaponStation ? (
          <div className="turret-damage-profile">
            <div className="turret-damage-profile__heading">
              <span>炮塔耐久影响</span>
              <small>所有可损坏武器站通用 · 转速随耐久下降</small>
            </div>
            <div className="turret-damage-profile__scale" aria-hidden="true">
              <div>
                <span>100%</span>
                <strong>50% <small>稳定器失效</small></strong>
                <span>0%</span>
              </div>
            </div>
            <div
              className="turret-damage-profile__body"
              role="img"
              aria-label="所有可损坏武器站通用：炮塔耐久低于百分之五十时失去稳定且转速逐步下降，耐久归零时锁死"
            >
              <div className="turret-damage-profile__track">
                <span className="turret-damage-profile__normal">
                  <strong>正常转速</strong>
                </span>
                <span className="turret-damage-profile__degraded">
                  <strong>转速衰减</strong>
                  <span className="turret-damage-profile__pulses" aria-hidden="true">
                    <span><i /><i /><i /><i /></span>
                    <span><i /><i /><i /></span>
                    <span><i /><i /></span>
                    <span><i /></span>
                  </span>
                </span>
              </div>
              <span className="turret-damage-profile__disabled">
                <i aria-hidden="true" />
                <strong>锁死</strong>
              </span>
            </div>
          </div>
        ) : null}
        {armedSeats.length === 0 ? <p className="muted-copy">没有独立武器站。</p> : null}
      </div>

      <div className="data-subsection">
        <div className="subsection-heading">
          <Database size={17} aria-hidden="true" />
          <h4>技术详情</h4>
        </div>
        <dl className="wiki-fact-list">
          <div className="amphibious-status" data-enabled={general.amphibious ?? "unknown"}>
            <dt>两栖能力</dt>
            <dd>
              <Waves size={18} aria-hidden="true" />
              <strong>
                {general.amphibious === null
                  ? "能力未知"
                  : general.amphibious
                    ? "支持两栖"
                    : "仅限陆地"}
              </strong>
            </dd>
          </div>
          <div><dt>承受范围伤害</dt><dd>{formatBoolean(general.isDamagedByRadial)}</dd></div>
          <div>
            <dt>指挥区</dt>
            <dd>
              {general.hasCommandZone === null
                ? "—"
                : general.hasCommandZone
                  ? formatNumber(general.commandZoneRadius, " m")
                  : "无"}
            </dd>
          </div>
          <div className="resource-composition">
            <dt>资源携带</dt>
            <dd>
              <div
                className="resource-capacity"
                data-resource="construction"
                data-unavailable={constructionCapacity === 0}
              >
                <div className="resource-capacity__heading">
                  <span>
                    建材
                    {constructionCapacity === 0 ? <em>无法携带</em> : null}
                  </span>
                  <strong>{formatNumber(general.constructionResources)} / {formatNumber(constructionCapacity)}</strong>
                </div>
                <div
                  className="resource-capacity__bar"
                  style={resourceLevelStyle(general.constructionResources, constructionCapacity)}
                  role="progressbar"
                  aria-label="建材携带量"
                  aria-valuenow={general.constructionResources ?? undefined}
                  aria-valuemax={constructionCapacity ?? undefined}
                >
                  <i />
                </div>
              </div>
              <div className="resource-capacity" data-resource="ammo">
                <div className="resource-capacity__heading">
                  <span>弹药</span>
                  <strong>{formatNumber(general.ammoResources)} / {formatNumber(ammoCapacity)}</strong>
                </div>
                <div
                  className="resource-capacity__bar"
                  style={resourceLevelStyle(general.ammoResources, ammoCapacity)}
                  role="progressbar"
                  aria-label="弹药携带量"
                  aria-valuenow={general.ammoResources ?? undefined}
                  aria-valuemax={ammoCapacity ?? undefined}
                >
                  <i />
                </div>
              </div>
            </dd>
          </div>
        </dl>
      </div>
      </div>

    </>
  );
}

function SiteFooterCopy({
  siteEdition,
  onSponsorOpen,
  onUpdatesOpen,
  sponsorButtonRef,
  updatesButtonRef,
  updateDateLabel,
  supportersDocumentUrl,
}: {
  siteEdition: SiteEdition;
  onSponsorOpen: () => void;
  onUpdatesOpen: () => void;
  sponsorButtonRef: { current: HTMLButtonElement | null };
  updatesButtonRef: { current: HTMLButtonElement | null };
  updateDateLabel: string;
  supportersDocumentUrl: string;
}) {
  return (
    <div className="site-footer__copy">
      <div className="site-footer__identity">
        {/* eslint-disable-next-line @next/next/no-img-element -- shared transparent vector brand asset is served by SiguaWiki */}
        <img
          className="site-footer__brand-logo"
          src={wikiAssetUrl("/assets/brand/siguad-wiki-logo.svg")}
          alt="丝瓜地 SiguaD"
          width={42}
          height={49}
        />
        <strong>
          <span>丝瓜地：铁皮饭堂</span>
          <small>{updateDateLabel}</small>
        </strong>
        <span className="site-footer__filing" aria-label="网站备案信息">
          <a
            className="site-footer__public-security-filing"
            href={PUBLIC_SECURITY_RECORD.url}
            target="_blank"
            rel="noreferrer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- official 14x16 public-security filing icon is served unchanged */}
            <img
              src={PUBLIC_SECURITY_RECORD.appIconUrl}
              alt=""
              width={14}
              height={16}
            />
            <span>{PUBLIC_SECURITY_RECORD.number}</span>
          </a>
          <a href={ICP_RECORD.url} target="_blank" rel="noreferrer">
            {ICP_RECORD.number}
          </a>
        </span>
      </div>

      <section className="site-footer__legal" aria-label="版权与开源许可">
        <div className="site-footer__legal-content">
          <h3>官方资源与权利归属</h3>
          {siteEdition === "china" ? (
            <>
              <p>
                本站由 <a href="https://space.bilibili.com/636117" target="_blank" rel="noreferrer">@猹Cheems</a> 个人整理维护，非腾讯或《战术小队》官方站点。
                <br />
                引用的国服官网图片、文字及标识等素材权利归腾讯及相应权利人所有。
              </p>
              <p>内容仅供资料查询与玩家交流，具体信息以国服官网、官方公告及游戏内实装为准。</p>
              <div className="site-footer__legal-links">
                <a href="https://sigua.qq.com/" target="_blank" rel="noreferrer">
                  藤瓜国服官网 <ExternalLink size={12} aria-hidden="true" />
                </a>
                <a href="https://www.tencent.com/legal/html/zh-cn/property.html" target="_blank" rel="noreferrer">
                  腾讯知识产权说明 <ExternalLink size={12} aria-hidden="true" />
                </a>
              </div>
            </>
          ) : (
            <>
              <p>
                本站由 <a href="https://space.bilibili.com/636117" target="_blank" rel="noreferrer">@猹Cheems</a> 个人整理维护，非 Offworld Industries 或 Squad 官方站点。
                <br />
                引用的游戏资产、图片、文字及标识等素材权利归 Offworld Industries 及相应权利人所有。
              </p>
              <p>内容仅供资料查询与玩家交流，具体信息以游戏官网、官方公告及游戏内实装为准。</p>
            </>
          )}
          <div className="site-footer__font-line">
            <h3>字体</h3>
            <p>
              无界黑 / Unbounded Sans · <a href="https://fonts.zeoseven.com/items/18/" target="_blank" rel="noreferrer">ZeoSeven FontsAPI</a> · SIL OFL 1.1 ·
              <a href="/fonts/LogoSCUnboundedSans-OFL.txt" target="_blank" rel="noreferrer">许可全文</a>；微软雅黑、Noto Sans SC、Cascadia Mono 等由设备提供。
            </p>
          </div>
        </div>
      </section>

      <details className="site-footer__technology">
        <summary>点击查看本站开源与隐私合规说明</summary>
        <div className="site-footer__technology-content">
          <div className="site-footer__technology-layout">
            <div className="site-footer__tech-groups">
              <div className="site-footer__tech-group">
                <strong>界面与构建</strong>
                <div className="site-footer__tech-chips">
                  <a className="site-footer__tech-chip" href="https://react.dev/" target="_blank" rel="noreferrer">React <small>MIT</small></a>
                  <a className="site-footer__tech-chip" href="https://react.dev/reference/react-dom" target="_blank" rel="noreferrer">React DOM <small>MIT</small></a>
                  <a className="site-footer__tech-chip" href="https://nextjs.org/" target="_blank" rel="noreferrer">Next.js <small>MIT</small></a>
                  <a className="site-footer__tech-chip" href="https://www.typescriptlang.org/" target="_blank" rel="noreferrer">TypeScript <small>Apache-2.0</small></a>
                  <a className="site-footer__tech-chip" href="https://vite.dev/" target="_blank" rel="noreferrer">Vite <small>MIT</small></a>
                  <a className="site-footer__tech-chip" href="https://github.com/cloudflare/vinext" target="_blank" rel="noreferrer">Vinext <small>MIT</small></a>
                </div>
              </div>
              <div className="site-footer__tech-group">
                <strong>静态交付与统计</strong>
                <div className="site-footer__tech-chips">
                  <a className="site-footer__tech-chip" href="https://nodejs.org/" target="_blank" rel="noreferrer">Node.js <small>MIT</small></a>
                  <a className="site-footer__tech-chip" href="https://caddyserver.com/" target="_blank" rel="noreferrer">Caddy <small>Apache-2.0</small></a>
                  <a className="site-footer__tech-chip" href="https://github.com/docker/compose" target="_blank" rel="noreferrer">Docker Compose <small>Apache-2.0</small></a>
                  <a className="site-footer__tech-chip" href="https://cloud.tencent.com/product/teo" target="_blank" rel="noreferrer">腾讯云 EdgeOne <small>CDN</small></a>
                </div>
              </div>
              <div className="site-footer__tech-group">
                <strong>3D、计算与图标</strong>
                <div className="site-footer__tech-chips">
                  <a className="site-footer__tech-chip" href="https://threejs.org/" target="_blank" rel="noreferrer">Three.js <small>MIT</small></a>
                  <a className="site-footer__tech-chip" href="https://github.com/gkjohnson/three-mesh-bvh" target="_blank" rel="noreferrer">three-mesh-bvh <small>MIT</small></a>
                  <a className="site-footer__tech-chip" href="https://github.com/zeux/meshoptimizer" target="_blank" rel="noreferrer">Meshoptimizer <small>MIT</small></a>
                  <a className="site-footer__tech-chip" href="https://lucide.dev/" target="_blank" rel="noreferrer">Lucide <small>ISC</small></a>
                </div>
              </div>
              <div className="site-footer__tech-group">
                <strong>数据、校验与地理聚合</strong>
                <div className="site-footer__tech-chips">
                  <a className="site-footer__tech-chip" href="https://ajv.js.org/" target="_blank" rel="noreferrer">AJV <small>MIT</small></a>
                  <a className="site-footer__tech-chip" href="https://github.com/snowyu/json-canonicalize.ts" target="_blank" rel="noreferrer">JSON Canonicalize <small>MIT</small></a>
                  <a className="site-footer__tech-chip" href="https://github.com/runk/node-maxmind" target="_blank" rel="noreferrer">MaxMind DB Reader <small>MIT</small></a>
                </div>
              </div>
            </div>
            <section className="site-footer__privacy-compliance">
              <strong>访问统计与隐私合规</strong>
              <p>
                页面仅通过一次同源请求上报日活，服务端按日期和 IP 去重。访问 IP 与首次访问时间使用 AES-GCM
                加密保存不超过 30 天；到期后删除原始记录，仅保留日活总数和满足至少 3 人匿名阈值的城市级汇总。
                本站不使用统计 Cookie，不记录账号、审核身份或浏览器指纹。
              </p>
            </section>
          </div>
        </div>
      </details>

      <section className="site-footer__acknowledgements" aria-label="致谢">
        <div className="site-footer__acknowledgements-intro">
          <h3>致谢</h3>
          <p>感谢开源社区和以下项目、集体与个人的帮助：</p>
        </div>
        <ul>
          <li>
            <a href="https://squad-armor.com/" target="_blank" rel="noreferrer">
              Squad Armor
            </a>
            <span>启发了作者制作本项目。</span>
          </li>
          <li>
            <a href="https://cloud.tencent.com/document/product/1552/118985" target="_blank" rel="noreferrer">
              腾讯云 EdgeOne
            </a>
            <span>提供了 CDN。</span>
          </li>
          <li>
            <a href="https://store.epicgames.com/p/squad?lang=en-US" target="_blank" rel="noreferrer">
              Squad Editor
            </a>
            <span>是世外工作室开发的编辑器，提供本项目的部分数据/算法。</span>
          </li>
        </ul>
        <button
          ref={sponsorButtonRef}
          className="site-footer__sponsor-button site-footer__sponsor-button--primary"
          type="button"
          onClick={onSponsorOpen}
        >
          赞助本项目
        </button>
        <div className="site-footer__secondary-actions">
          <a
            className="site-footer__sponsor-button site-footer__feedback-button"
            href={FEEDBACK_FORM_URL}
            target="_blank"
            rel="noreferrer"
          >
            反馈问题 / 提建议
          </a>
          <button
            ref={updatesButtonRef}
            className="site-footer__sponsor-button site-footer__updates-button"
            type="button"
            onClick={onUpdatesOpen}
          >
            更新日志
          </button>
        </div>
      </section>

      <SiteFooterSupporters documentUrl={supportersDocumentUrl} />
    </div>
  );
}

function SiteFooterSponsorModal({
  closeButtonRef,
  onClose,
}: {
  closeButtonRef: { current: HTMLButtonElement | null };
  onClose: () => void;
}) {
  return (
    <div
      className="site-footer__sponsor-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-footer-sponsor-title"
    >
      <button
        className="site-footer__sponsor-modal-backdrop"
        type="button"
        aria-label="关闭赞助弹窗"
        onClick={onClose}
      />
      <section className="site-footer__sponsor-dialog">
        <header>
          <div>
            <small>SUPPORT PROJECT</small>
            <strong id="site-footer-sponsor-title">支持铁皮饭堂</strong>
          </div>
          <button
            ref={closeButtonRef}
            className="site-footer__sponsor-modal-close"
            type="button"
            aria-label="关闭赞助弹窗"
            onClick={onClose}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        {/* eslint-disable-next-line @next/next/no-img-element -- local sponsor QR asset is intentionally rendered as a plain image */}
        <img className="site-footer__sponsor-qr" src={DONATE_QR_SRC} alt="赞助二维码" />
        <div className="site-footer__sponsor-copy">
          <p>
            本项目为公益项目，需要持续维护代码与服务器，保持数据最新。其中，3D资源的分发会消耗大量流量资源，产生较多成本，你的帮助可以让本项目不断优化，奔向下一个进攻点！
          </p>
          <p>
            赞助时备注你的称呼并联系我，可以通过 B站私信 @猹Cheems 或邮箱 thankucheems@gmail.com 联系，我会将你的ID与主页加入致谢名单，再次感谢！
          </p>
        </div>
      </section>
    </div>
  );
}

function SiteFooterHelp({
  helpOpen,
  docked,
  helpButtonRef,
  helpId,
  onToggle,
  onClose,
  onOpenContentAdmin,
}: {
  helpOpen: boolean;
  docked: boolean;
  helpButtonRef: { current: HTMLButtonElement | null };
  helpId: string;
  onToggle: () => void;
  onClose: () => void;
  onOpenContentAdmin: () => void;
}) {
  return (
    <div
      className="site-footer__help"
      data-docked={docked}
    >
      <aside
        id={helpId}
        className="site-footer__help-panel"
        aria-label="铁皮饭堂使用帮助"
        hidden={!helpOpen}
      >
        <header>
          <div>
            <strong>铁皮饭堂助手</strong>
          </div>
          <button type="button" aria-label="关闭帮助" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <ol>
          <li>在顶栏按名称、俗称或拼音搜索载具。</li>
          <li>打开载具卡片，切换外观、装甲与内构视图。</li>
          <li>点击卡片上的圈问号，查看相应载具的百科资料。</li>
          <li>选择武器后，在防护图中动态查看当前角度的击穿区域。</li>
          <li>点击载具模型，模拟射击并展示完整击穿路径。</li>
        </ol>
        <p>数据仅供参考，实装情况以游戏内为准。</p>
        <button
          className="site-footer__help-admin"
          type="button"
          onClick={onOpenContentAdmin}
        >
          <KeyRound size={14} aria-hidden="true" />
          管理员内容更新
        </button>
      </aside>

      <button
        ref={helpButtonRef}
        className="site-footer__help-trigger"
        type="button"
        aria-expanded={helpOpen}
        aria-controls={helpId}
        onClick={onToggle}
      >
        <span className="site-footer__help-portrait" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- optimized transparent local preview derivative avoids loading the full crew composition */}
          <img src="/images/site/vehicle-crew-help.webp" alt="" />
        </span>
        <span className="site-footer__help-label">
          <HelpCircle size={16} aria-hidden="true" />
          帮助
        </span>
      </button>
    </div>
  );
}

function SiteFooter({
  variant,
  siteEdition,
}: {
  variant: "faction" | "catalog";
  siteEdition: SiteEdition;
}) {
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const chinaUpdates = useSiteUpdates("/updates.json");
  const internationalUpdates = useSiteUpdates("/squad/updates.json");
  const currentUpdates =
    siteEdition === "international" ? internationalUpdates : chinaUpdates;
  const sponsorButtonRef = useRef<HTMLButtonElement | null>(null);
  const sponsorCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const updatesButtonRef = useRef<HTMLButtonElement | null>(null);
  const updatesCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const openSponsor = useCallback(() => {
    setUpdatesOpen(false);
    setSponsorOpen(true);
  }, []);
  const closeSponsor = useCallback(() => {
    setSponsorOpen(false);
    window.requestAnimationFrame(() => sponsorButtonRef.current?.focus());
  }, []);
  const openUpdates = useCallback(() => {
    setSponsorOpen(false);
    setUpdatesOpen(true);
  }, []);
  const closeUpdates = useCallback(() => {
    setUpdatesOpen(false);
    window.requestAnimationFrame(() => updatesButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!sponsorOpen) return undefined;
    sponsorCloseButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSponsor();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeSponsor, sponsorOpen]);

  useEffect(() => {
    if (!updatesOpen) return undefined;
    updatesCloseButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeUpdates();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeUpdates, updatesOpen]);

  return (
    <footer
      className={`site-footer site-footer--${variant}`}
      aria-label={variant === "faction" ? "阵营选择页底部信息" : undefined}
    >
      <SiteFooterCopy
        siteEdition={siteEdition}
        onSponsorOpen={openSponsor}
        onUpdatesOpen={openUpdates}
        sponsorButtonRef={sponsorButtonRef}
        updatesButtonRef={updatesButtonRef}
        updateDateLabel={currentUpdates.dateLabel}
        supportersDocumentUrl="/supporters.json"
      />
      {sponsorOpen ? (
        <SiteFooterSponsorModal
          closeButtonRef={sponsorCloseButtonRef}
          onClose={closeSponsor}
        />
      ) : null}
      {updatesOpen ? (
        <SiteFooterUpdatesModal
          closeButtonRef={updatesCloseButtonRef}
          documents={{
            china: chinaUpdates.document,
            international: internationalUpdates.document,
          }}
          failures={{
            china: chinaUpdates.failed,
            international: internationalUpdates.failed,
          }}
          initialEdition={siteEdition}
          onClose={closeUpdates}
        />
      ) : null}
    </footer>
  );
}

function DetailPanel({
  card,
  siteEdition,
  textureVariants,
  onTextureVariantSelect,
  onClose,
  encyclopediaOpen,
  viewerNavigation,
  onViewerNavigationChange,
}: {
  card: CatalogCardEntry | null;
  siteEdition: SiteEdition;
  textureVariants: CatalogCardEntry[];
  onTextureVariantSelect: (card: CatalogCardEntry) => void;
  onClose: () => void;
  encyclopediaOpen: boolean;
  viewerNavigation: ViewerNavigationState;
  onViewerNavigationChange: (state: ViewerNavigationState) => void;
}) {
  if (!card) return null;
  const { data, record } = card;
  const hasViewer = data !== null || Boolean(
    card.variant?.runtimeVehicleRef || card.variant?.visualArtifactRef,
  );
  const displayName = vehicleDisplayName(record, card.variant, card.alias);
  const viewerTextureVariants = textureVariants.flatMap((entry, index) => {
    const rawName = entry.data?.general.rawName
      ?? entry.variant?.sourceRawName
      ?? entry.record.mapping.selectedRawName;
    if (!rawName) return [];
    return [{
      id: entry.cardId,
      rawName,
      label: vehicleLivery(entry.variant) ?? entry.alias ?? `变体 ${index + 1}`,
      displayName: vehicleDisplayName(entry.record, entry.variant, entry.alias),
    }];
  });

  return (
    <aside
      className={`detail-panel${hasViewer ? " detail-panel--viewer" : " detail-panel--reference-only"}`}
      data-open="true"
      role="dialog"
      aria-modal="false"
      aria-label={`${displayName}载具详情`}
    >
      {!hasViewer && !encyclopediaOpen && (
        <button className="detail-close" type="button" onClick={onClose}>
          <X size={19} aria-hidden="true" />
          <span className="sr-only">关闭载具详情</span>
        </button>
      )}
      <section className="detail-section detail-section--reference detail-section--preview">
        {hasViewer && (
          <Suspense
            fallback={(
              <VehicleViewerLoading
                vehicleName={displayName}
                onClose={encyclopediaOpen ? undefined : onClose}
              />
            )}
          >
            <VehicleViewer
              key={card.cardId}
              siteEdition={siteEdition}
              cardId={record.promoEntryId}
              rawName={data?.general.rawName ?? record.mapping.selectedRawName ?? ""}
              runtimeVehicleRef={card.variant?.runtimeVehicleRef ?? null}
              visualArtifactRef={card.variant?.visualArtifactRef ?? null}
              displayName={displayName}
              attackSourcePresentation={{
                cardId: record.promoEntryId,
                displayName,
                groupId: record.official.groupId,
                groupName: record.official.groupNameZh,
                groupOrder: record.promotionOrder,
                type: record.official.typeZh,
                canonicalRawName:
                  card.variant?.editorAvailability?.mechanicalRawName ??
                  data?.general.rawName ?? record.mapping.selectedRawName ?? "",
              }}
              referenceData={data}
              textureVariants={viewerTextureVariants}
              onTextureVariantChange={(variantId) => {
                const nextVariant = textureVariants.find((entry) => entry.cardId === variantId);
                if (nextVariant) onTextureVariantSelect(nextVariant);
              }}
              onClose={encyclopediaOpen ? undefined : onClose}
              navigationState={viewerNavigation}
              onNavigationStateChange={onViewerNavigationChange}
            />
          </Suspense>
        )}
        <section
          className="vehicle-encyclopedia"
          id={`vehicle-encyclopedia-${card.cardId}`}
          data-open={encyclopediaOpen}
          aria-hidden={!encyclopediaOpen}
          aria-label={`${displayName}载具百科`}
          inert={!encyclopediaOpen}
        >
          <header className="vehicle-encyclopedia__heading">
            <HelpCircle size={18} aria-hidden="true" />
            <h3>{displayName} · 载具百科</h3>
            <button
              className="vehicle-encyclopedia__close"
              type="button"
              onClick={onClose}
              aria-label="关闭载具详情"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          {encyclopediaOpen ? <ReferenceDataView data={data} /> : null}
        </section>
      </section>
    </aside>
  );
}

interface GlobalVehicleSearchProps {
  id: string;
  variant: "hero" | "dock";
  query: string;
  results: CatalogIndexSearchResult[];
  onQueryChange: (query: string) => void;
  onSelect: (record: CatalogSearchRecord, variant?: CatalogSearchVariant) => void;
}

function GlobalVehicleSearch({
  id,
  variant,
  query,
  results,
  onQueryChange,
  onSelect,
}: GlobalVehicleSearchProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const resultListId = `${id}-results`;
  const showResults = focused && normalizeVehicleSearch(query).length > 0;
  const firstResult = results[0];

  return (
    <div
      className={`global-vehicle-search global-vehicle-search--${variant}`}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !normalizeVehicleSearch(query)) return;
        event.preventDefault();
        event.stopPropagation();
        onQueryChange("");
        inputRef.current?.focus();
      }}
    >
      <div className="global-vehicle-search__input">
        <Search size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          type="search"
          value={query}
          placeholder="搜索载具 / 俗称 / 拼音"
          aria-label="全局搜索载具名称、俗称或拼音"
          aria-autocomplete="list"
          aria-controls={resultListId}
          aria-expanded={showResults}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && firstResult) {
              event.preventDefault();
              onSelect(firstResult.record, firstResult.variants[0]);
            }
            if (event.key === "ArrowDown" && firstResult) {
              event.preventDefault();
              resultRefs.current[0]?.focus();
            }
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="清除全局搜索"
            onClick={() => {
              onQueryChange("");
              inputRef.current?.focus();
            }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      {showResults && (
        <div
          id={resultListId}
          className="global-vehicle-search__results"
          role="listbox"
          aria-label="全局载具搜索结果"
        >
          {results.length > 0 ? (
            <div className="global-vehicle-search__result-groups">
              {results.map(({ record, variants }, index) => {
                return (
                  <section
                    className="global-vehicle-search__result-group"
                    key={record.promoEntryId}
                    aria-label={`${record.official.nameZh}搜索结果`}
                  >
                    <header className="global-vehicle-search__result-heading">
                      <span className="global-vehicle-search__result-main">
                        <strong>{record.official.nameZh}</strong>
                        <small>{record.official.groupNameZh}</small>
                      </span>
                      <span className="global-vehicle-search__result-count">
                        {record.official.typeNameZh}
                        {variants.length > 0 ? ` · ${searchVariantSummary(variants)}` : ""}
                      </span>
                    </header>
                    {variants.length > 0 ? (
                      <div
                        className="global-vehicle-search__result-variants"
                        role="group"
                        aria-label={`${record.official.nameZh}具体配置`}
                      >
                        {variants.map((variant, variantIndex) => {
                          const displayName = variant.displayName || variant.alias;
                          const localizedDisplayName = displayName;
                          const label = searchVariantLabel(record, variant);
                          return (
                            <button
                              key={variant.sourceRawName}
                              ref={
                                index === 0 && variantIndex === 0
                                  ? (node) => {
                                      resultRefs.current[0] = node;
                                    }
                                  : undefined
                              }
                              className="global-vehicle-search__result-variant"
                              type="button"
                              role="option"
                              aria-selected="false"
                              aria-label={localizedDisplayName}
                              title={localizedDisplayName}
                              onClick={() => onSelect(record, variant)}
                            >
                              <span>{label}</span>
                              <small>{localizedDisplayName}</small>
                              <ChevronRight size={14} aria-hidden="true" />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <button
                        ref={
                          index === 0
                            ? (node) => {
                                resultRefs.current[0] = node;
                              }
                            : undefined
                        }
                        className="global-vehicle-search__result-family"
                        type="button"
                        role="option"
                        aria-selected="false"
                        onClick={() => onSelect(record)}
                      >
                        <span className="global-vehicle-search__result-main">
                          <strong>{record.official.nameZh}</strong>
                          <small>{record.official.groupNameZh}</small>
                        </span>
                        <ChevronRight size={16} aria-hidden="true" />
                      </button>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="global-vehicle-search__empty">没有匹配的官网宣传载具</div>
          )}
        </div>
      )}
    </div>
  );
}

const CHARACTER_WHEEL_OFFSETS = [-3, -2, -1, 0, 1, 2, 3] as const;
const CHARACTER_WHEEL_STEP = 108;
const CHARACTER_WHEEL_MIN_FLING_VELOCITY = 0.08;
const CHARACTER_WHEEL_MAX_FLING_VELOCITY = 1.2;
const CHARACTER_WHEEL_STOP_VELOCITY = 0.03;
const CHARACTER_WHEEL_FRICTION = 0.925;
const CHARACTER_WHEEL_CLICK_ANIMATION_MS = 580;
const FACTION_BACKGROUND_CROSSFADE_MS = 240;

function FactionBackground({ src }: { src: string }) {
  const currentSrcRef = useRef(src);
  const requestedSrcRef = useRef(src);
  const revealFrameRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);
  const [pendingVisible, setPendingVisible] = useState(false);

  useEffect(() => {
    requestedSrcRef.current = src;
    if (revealFrameRef.current !== null) {
      window.cancelAnimationFrame(revealFrameRef.current);
      revealFrameRef.current = null;
    }
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setPendingVisible(false);

    if (src === currentSrcRef.current) {
      setPendingSrc(null);
      return undefined;
    }

    let cancelled = false;
    void preloadFactionImage(src).then(
      () => {
        if (!cancelled && requestedSrcRef.current === src) {
          setPendingSrc(src);
        }
      },
      () => undefined,
    );

    return () => {
      cancelled = true;
      if (revealFrameRef.current !== null) {
        window.cancelAnimationFrame(revealFrameRef.current);
        revealFrameRef.current = null;
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [src]);

  useEffect(() => {
    if (!pendingSrc || pendingSrc !== requestedSrcRef.current) return undefined;
    const nextSrc = pendingSrc;

    revealFrameRef.current = window.requestAnimationFrame(() => {
      revealFrameRef.current = null;
      setPendingVisible(true);
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        if (requestedSrcRef.current !== nextSrc) return;
        currentSrcRef.current = nextSrc;
        setCurrentSrc(nextSrc);
        setPendingSrc(null);
        setPendingVisible(false);
      }, FACTION_BACKGROUND_CROSSFADE_MS);
    });

    return () => {
      if (revealFrameRef.current !== null) {
        window.cancelAnimationFrame(revealFrameRef.current);
        revealFrameRef.current = null;
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [pendingSrc]);

  return (
    <div className="faction-selector__visual-frame" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- exact untransformed pixels keep the local background aligned */}
      <img
        className="faction-selector__base"
        src={currentSrc}
        alt=""
        decoding="async"
      />
      {pendingSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- a decoded second layer avoids cold full-viewport swaps
        <img
          className="faction-selector__base faction-selector__base--incoming"
          src={pendingSrc}
          alt=""
          decoding="async"
          data-visible={pendingVisible ? "true" : undefined}
        />
      ) : null}
    </div>
  );
}

function wrapWheelIndex(index: number, length: number) {
  return ((index % length) + length) % length;
}

function characterWheelPosition(offset: number) {
  if (offset <= -3) return "outer-left";
  if (offset === -2) return "far-left";
  if (offset === -1) return "left";
  if (offset === 0) return "center";
  if (offset === 1) return "right";
  if (offset === 2) return "far-right";
  return "outer-right";
}

function characterWheelRenderStyle(offset: number, dragOffset: number): CSSProperties {
  const slot = offset + dragOffset / CHARACTER_WHEEL_STEP;
  const depth = Math.min(3.5, Math.abs(slot));
  const x = -50 + slot * 40.5;
  const flagFocus = Math.exp(-depth * 1.85);
  const flagOpacity = 0.08 + flagFocus * 0.64;
  const flagScale = 0.72 + flagFocus * 0.2;
  const flagLift = 2 + (1 - flagFocus) * 6;

  return {
    zIndex: 70 - Math.round(depth * 12),
    opacity: 1,
    transform: `translate3d(${x.toFixed(3)}%, 0, 0)`,
    "--wheel-flag-opacity": flagOpacity.toFixed(3),
    "--wheel-flag-scale": flagScale.toFixed(3),
    "--wheel-flag-lift": `${flagLift.toFixed(2)}px`,
  } as CSSProperties;
}

function FactionCharacterWheel({
  groups,
  activeGroupId,
  siteEdition,
  onPreviewChange,
  onSelect,
}: {
  groups: FactionGroup[];
  activeGroupId: string | null;
  siteEdition: SiteEdition;
  onPreviewChange: (groupId: string) => void;
  onSelect: (groupId: string) => void;
}) {
  const activeIndex = Math.max(
    0,
    groups.findIndex((group) => group.id === activeGroupId),
  );
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const dragOffsetRef = useRef(0);
  const kineticFrameRef = useRef<number | null>(null);
  const clickAnimationTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isKinetic, setIsKinetic] = useState(false);
  const [isClickAnimating, setIsClickAnimating] = useState(false);
  const [clickAnimationBaseIndex, setClickAnimationBaseIndex] = useState(activeIndex);
  const [clickAnimationDelta, setClickAnimationDelta] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const setWheelOffset = useCallback((nextOffset: number) => {
    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  }, []);

  const previewRelativeGroup = useCallback(
    (delta: number) => {
      if (groups.length === 0 || delta === 0) return;
      const nextIndex = wrapWheelIndex(activeIndexRef.current + delta, groups.length);
      activeIndexRef.current = nextIndex;
      onPreviewChange(groups[nextIndex].id);
    },
    [groups, onPreviewChange],
  );

  const cancelKineticMotion = useCallback(() => {
    if (kineticFrameRef.current !== null) {
      window.cancelAnimationFrame(kineticFrameRef.current);
      kineticFrameRef.current = null;
    }
    setIsKinetic(false);
  }, []);

  const applyWheelMotion = useCallback(
    (nextOffset: number) => {
      let residual = nextOffset;
      while (residual <= -CHARACTER_WHEEL_STEP) {
        previewRelativeGroup(1);
        residual += CHARACTER_WHEEL_STEP;
      }
      while (residual >= CHARACTER_WHEEL_STEP) {
        previewRelativeGroup(-1);
        residual -= CHARACTER_WHEEL_STEP;
      }
      setWheelOffset(residual);
    },
    [previewRelativeGroup, setWheelOffset],
  );

  const settleWheel = useCallback(
    (releaseVelocity: number) => {
      const residual = dragOffsetRef.current;
      const projectedOffset = residual + releaseVelocity * 72;
      const shouldAdvance = Math.abs(projectedOffset) >= CHARACTER_WHEEL_STEP * 0.34;

      if (shouldAdvance) {
        const direction = projectedOffset < 0 ? 1 : -1;
        flushSync(() => {
          previewRelativeGroup(direction);
          setWheelOffset(residual + direction * CHARACTER_WHEEL_STEP);
          setIsDragging(false);
          setIsKinetic(false);
        });
        kineticFrameRef.current = window.requestAnimationFrame(() => {
          kineticFrameRef.current = null;
          setWheelOffset(0);
        });
        return;
      }

      setIsDragging(false);
      setIsKinetic(false);
      setWheelOffset(0);
    },
    [previewRelativeGroup, setWheelOffset],
  );

  const startKineticMotion = useCallback(
    (initialVelocity: number) => {
      cancelKineticMotion();
      setIsDragging(false);
      setIsKinetic(true);

      let velocity = Math.max(
        -CHARACTER_WHEEL_MAX_FLING_VELOCITY,
        Math.min(CHARACTER_WHEEL_MAX_FLING_VELOCITY, initialVelocity),
      );
      let previousTime = window.performance.now();

      const animate = (time: number) => {
        const elapsed = Math.min(32, Math.max(1, time - previousTime));
        previousTime = time;
        applyWheelMotion(dragOffsetRef.current + velocity * elapsed);
        velocity *= Math.pow(CHARACTER_WHEEL_FRICTION, elapsed / (1000 / 60));

        if (Math.abs(velocity) <= CHARACTER_WHEEL_STOP_VELOCITY) {
          kineticFrameRef.current = null;
          settleWheel(velocity);
          return;
        }
        kineticFrameRef.current = window.requestAnimationFrame(animate);
      };

      kineticFrameRef.current = window.requestAnimationFrame(animate);
    },
    [applyWheelMotion, cancelKineticMotion, settleWheel],
  );

  useEffect(
    () => () => {
      if (kineticFrameRef.current !== null) {
        window.cancelAnimationFrame(kineticFrameRef.current);
      }
      if (clickAnimationTimerRef.current !== null) {
        window.clearTimeout(clickAnimationTimerRef.current);
      }
    },
    [],
  );

  const moveBy = useCallback(
    (delta: number) => {
      cancelKineticMotion();
      setWheelOffset(0);
      previewRelativeGroup(delta);
    },
    [cancelKineticMotion, previewRelativeGroup, setWheelOffset],
  );

  const animateMoveBy = useCallback(
    (delta: number) => {
      if (delta === 0) return;

      cancelKineticMotion();
      const baseIndex = activeIndexRef.current;
      const targetIndex = wrapWheelIndex(baseIndex + delta, groups.length);
      setClickAnimationBaseIndex(baseIndex);
      setIsClickAnimating(true);
      setClickAnimationDelta(delta);
      setWheelOffset(-delta * CHARACTER_WHEEL_STEP);
      onPreviewChange(groups[targetIndex].id);
      clickAnimationTimerRef.current = window.setTimeout(() => {
        clickAnimationTimerRef.current = null;
        flushSync(() => {
          activeIndexRef.current = targetIndex;
          setWheelOffset(0);
          setIsClickAnimating(false);
          setClickAnimationDelta(0);
        });
      }, CHARACTER_WHEEL_CLICK_ANIMATION_MS);
    },
    [cancelKineticMotion, groups, onPreviewChange, setWheelOffset],
  );

  const moveTo = useCallback(
    (nextIndex: number) => {
      if (groups.length === 0) return;
      cancelKineticMotion();
      setWheelOffset(0);
      const wrappedIndex = wrapWheelIndex(nextIndex, groups.length);
      activeIndexRef.current = wrappedIndex;
      onPreviewChange(groups[wrappedIndex].id);
    },
    [cancelKineticMotion, groups, onPreviewChange, setWheelOffset],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isClickAnimating) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelKineticMotion();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      moved: false,
    };
    setWheelOffset(0);
    setIsDragging(false);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      if (Math.abs(event.clientX - drag.startX) <= 7) return;
      drag.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    }
    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    const deltaX = event.clientX - drag.lastX;
    const instantVelocity = deltaX / elapsed;
    drag.velocity = drag.velocity * 0.58 + instantVelocity * 0.42;
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;
    applyWheelMotion(dragOffsetRef.current + deltaX);
    event.preventDefault();
  };

  const finishPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
    allowInertia = true,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 120);
    }
    const idleTime = Math.max(0, event.timeStamp - drag.lastTime);
    const releaseVelocity = drag.velocity * Math.max(0, 1 - idleTime / 120);
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (
      drag.moved &&
      allowInertia &&
      Math.abs(releaseVelocity) >= CHARACTER_WHEEL_MIN_FLING_VELOCITY
    ) {
      startKineticMotion(releaseVelocity);
      return;
    }
    settleWheel(allowInertia ? releaseVelocity : 0);
  };

  const handleItemClick = (groupId: string, offset: number) => {
    if (isClickAnimating) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (offset === 0) onSelect(groupId);
    else animateMoveBy(offset);
  };

  const handleItemKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    groupId: string,
    offset: number,
  ) => {
    if (isClickAnimating) {
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveBy(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveBy(1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(groups.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleItemClick(groupId, offset);
    }
  };

  if (groups.length === 0) return null;

  const firstWheelOffset = Math.min(
    CHARACTER_WHEEL_OFFSETS[0],
    CHARACTER_WHEEL_OFFSETS[0] + clickAnimationDelta,
  );
  const wheelOffsets = isClickAnimating
    ? Array.from(
        { length: CHARACTER_WHEEL_OFFSETS.length + Math.abs(clickAnimationDelta) },
        (_, index) => firstWheelOffset + index,
      )
    : CHARACTER_WHEEL_OFFSETS;
  const wheelBaseIndex = isClickAnimating
    ? clickAnimationBaseIndex
    : activeIndex;

  return (
    <section className="faction-character-wheel" aria-label="人物选择轮盘">
      <div
        className={`faction-character-wheel__viewport${isDragging ? " faction-character-wheel__viewport--dragging" : ""}${isKinetic ? " faction-character-wheel__viewport--kinetic" : ""}${isClickAnimating ? " faction-character-wheel__viewport--clicking" : ""}`}
        data-motion-state={isClickAnimating ? "clicking" : isDragging ? "dragging" : isKinetic ? "kinetic" : "idle"}
        aria-busy={isClickAnimating || undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={(event) => finishPointer(event, false)}
        role="group"
        aria-label="拖动或快速滑动轮盘切换人物"
      >
        <div className="faction-character-wheel__track">
          {wheelOffsets.map((offset) => {
            const group = groups[wrapWheelIndex(wheelBaseIndex + offset, groups.length)];
            const asset = factionVisualAsset(group, siteEdition);
            const position = characterWheelPosition(offset);
            const displayName = group.name;
            return (
              <button
                key={group.id}
                className="faction-character-wheel__item"
                data-group-id={group.id}
                data-wheel-position={position}
                style={characterWheelRenderStyle(offset, dragOffset)}
                type="button"
                tabIndex={Math.abs(offset) > 3 ? -1 : undefined}
                aria-hidden={Math.abs(offset) > 3 || undefined}
                aria-current={offset === 0 ? "true" : undefined}
                aria-label={offset === 0 ? `选择${displayName}` : `将${displayName}移到中央`}
                onClick={() => handleItemClick(group.id, offset)}
                onKeyDown={(event) => handleItemKeyDown(event, group.id, offset)}
              >
                <span className="faction-character-wheel__hit-area" aria-hidden="true" />
                <span className="faction-character-wheel__image-shell">
                  <span className="faction-character-wheel__flag" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element -- compact local faction flag follows the wheel focus state */}
                    <img
                      src={asset.logo}
                      alt=""
                      width={64}
                      height={44}
                      decoding="async"
                      draggable={false}
                    />
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- transparent local character art is the wheel's source-native portrait */}
                  <img
                    className="faction-character-wheel__portrait"
                    src={asset.foreground}
                    alt={`${displayName} 人物`}
                    width={640}
                    height={960}
                    decoding="async"
                    draggable={false}
                    style={{
                      "--wheel-art-baseline-offset": `${asset.foregroundBaselineOffset}%`,
                      "--wheel-art-scale": asset.foregroundScale,
                    } as CSSProperties}
                  />
                </span>
                <span className="faction-character-wheel__item-label">
                  <small>{group.id.toUpperCase()}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function CatalogApp({ siteEdition }: { siteEdition: SiteEdition }) {
  const [loadedCatalog, setLoadedCatalog] = useState<{
    siteEdition: SiteEdition;
    index: PublicCatalogIndex;
  } | null>(null);
  const [loadFailure, setLoadFailure] = useState<{
    siteEdition: SiteEdition;
    message: string;
  } | null>(null);
  const catalogIndex =
    loadedCatalog?.siteEdition === siteEdition ? loadedCatalog.index : null;
  const loadError =
    loadFailure?.siteEdition === siteEdition ? loadFailure.message : null;

  useEffect(() => {
    let cancelled = false;
    loadInitialPublicCatalog(siteEdition, window.location.href)
      .then((nextCatalogIndex) => {
        if (cancelled) return;
        setLoadedCatalog({ siteEdition, index: nextCatalogIndex });
        setLoadFailure(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setLoadFailure({
          siteEdition,
          message: reason instanceof Error ? reason.message : String(reason),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [siteEdition]);

  const requestCatalogGroup = useCallback(async (groupId: string) => {
    const current = loadedCatalog?.siteEdition === siteEdition
      ? loadedCatalog.index
      : null;
    if (current?.records.some((record) => record.official.groupId === groupId)) {
      return current;
    }
    try {
      const next = await loadPublicCatalogGroup(siteEdition, groupId);
      setLoadedCatalog({ siteEdition, index: next });
      setLoadFailure(null);
      return next;
    } catch (reason: unknown) {
      setLoadFailure({
        siteEdition,
        message: reason instanceof Error ? reason.message : String(reason),
      });
      throw reason;
    }
  }, [loadedCatalog, siteEdition]);

  const requestFullCatalog = useCallback(async () => {
    const current = loadedCatalog?.siteEdition === siteEdition
      ? loadedCatalog.index
      : null;
    const expectedCount = current?.groups.reduce(
      (total, group) => total + group.recordCount,
      0,
    );
    if (current && current.records.length === expectedCount) return current;
    try {
      const next = await loadPublicCatalog(siteEdition);
      setLoadedCatalog({ siteEdition, index: next });
      setLoadFailure(null);
      return next;
    } catch (reason: unknown) {
      setLoadFailure({
        siteEdition,
        message: reason instanceof Error ? reason.message : String(reason),
      });
      throw reason;
    }
  }, [loadedCatalog, siteEdition]);

  const requestCatalogLocation = useCallback(async (href: string) => {
    try {
      const next = await loadInitialPublicCatalog(siteEdition, href);
      setLoadedCatalog({ siteEdition, index: next });
      setLoadFailure(null);
      return next;
    } catch (reason: unknown) {
      setLoadFailure({
        siteEdition,
        message: reason instanceof Error ? reason.message : String(reason),
      });
      throw reason;
    }
  }, [siteEdition]);

  if (loadError) {
    return (
      <main className="catalog-data-state" role="alert">
        <CircleAlert aria-hidden="true" />
        <h1>载具资料暂时无法读取</h1>
        <p>{loadError}</p>
      </main>
    );
  }
  if (!catalogIndex) {
    return null;
  }
  return (
    <CatalogAppReady
      catalogIndex={catalogIndex}
      siteEdition={siteEdition}
      onRequestGroup={requestCatalogGroup}
      onRequestFullCatalog={requestFullCatalog}
      onRequestLocation={requestCatalogLocation}
    />
  );
}

function CatalogAppReady({
  catalogIndex,
  siteEdition,
  onRequestGroup,
  onRequestFullCatalog,
  onRequestLocation,
}: {
  catalogIndex: PublicCatalogIndex;
  siteEdition: SiteEdition;
  onRequestGroup: (groupId: string) => Promise<PublicCatalogIndex>;
  onRequestFullCatalog: () => Promise<PublicCatalogIndex>;
  onRequestLocation: (href: string) => Promise<PublicCatalogIndex>;
}) {
  const editionProfile = siteEditionProfile(siteEdition);
  const editionBasePath =
    process.env.NODE_ENV === "development"
      ? siteEdition === "china"
        ? "/china"
        : ""
      : siteEditionBasePath(siteEdition);
  const initialLocation = useMemo(
    () =>
      typeof window === "undefined"
        ? {
            groupId: ALL_GROUPS,
            query: "",
            selectedId: null,
            viewer: { ...DEFAULT_VIEWER_NAVIGATION_STATE },
          }
        : parseCatalogLocation(window.location.href, catalogIndex, {
            basePath: editionBasePath,
          }),
    [catalogIndex, editionBasePath],
  );
  const [query, setQuery] = useState(initialLocation.query);
  const [globalQuery, setGlobalQuery] = useState("");
  const [groupId, setGroupId] = useState(initialLocation.groupId);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialLocation.selectedId,
  );
  const [encyclopediaOpen, setEncyclopediaOpen] = useState(false);
  const [morphFactionId, setMorphFactionId] = useState<string | null>(null);
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [activeFactionDustId, setActiveFactionDustId] = useState<string | null>(null);
  const [preloadedFactionIds, setPreloadedFactionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [choicePanelActive, setChoicePanelActive] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [contentAdminOpen, setContentAdminOpen] = useState(false);
  const [dataAccuracyNotices, setDataAccuracyNotices] = useState<NonNullable<
    ReturnType<typeof parseDataAccuracyNoticesDocument>
  > | null>(null);
  const [dataAccuracyNoticeOpen, setDataAccuracyNoticeOpen] = useState(true);
  const [dataAccuracyNoticeSecondsLeft, setDataAccuracyNoticeSecondsLeft] = useState(10);
  const [catalogsByGroup, setCatalogsByGroup] = useState<Record<string, PublicFactionCatalog>>({});
  const [catalogErrorsByGroup, setCatalogErrorsByGroup] = useState<Record<string, string>>({});
  const [catalogRetryToken, setCatalogRetryToken] = useState(0);
  const [viewerNavigation, setViewerNavigation] = useState<ViewerNavigationState>(
    () => initialLocation.viewer as ViewerNavigationState,
  );
  const selectorRef = useRef<HTMLElement | null>(null);
  const selectorTitleRef = useRef<HTMLHeadingElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const factionDockFlagsRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const factionButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const factionViewTransitionRef = useRef<ViewTransition | null>(null);
  const detailViewTransitionRef = useRef<ViewTransition | null>(null);
  const detailTransitionCardRef = useRef<HTMLButtonElement | null>(null);
  const closeContentAdmin = useCallback(() => {
    setContentAdminOpen(false);
    window.requestAnimationFrame(() => helpButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    let disposed = false;
    let requestGeneration = 0;
    const load = async (force = false) => {
      const generation = ++requestGeneration;
      const url = force
        ? `${DATA_ACCURACY_NOTICES_DOCUMENT_URL}?admin_refresh=${Date.now()}`
        : DATA_ACCURACY_NOTICES_DOCUMENT_URL;
      try {
        const response = await fetch(url, {
          cache: force ? "reload" : "default",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const parsed = parseDataAccuracyNoticesDocument(await response.json());
        if (!disposed && generation === requestGeneration && parsed) {
          setDataAccuracyNotices(parsed);
          if (force) {
            setDataAccuracyNoticeSecondsLeft(10);
            setDataAccuracyNoticeOpen(true);
          }
        }
      } catch {
        // Keep the bundled copy when the small hot-update document is temporarily unavailable.
      }
    };
    const handleRuntimeDocumentUpdated = (event: Event) => {
      if (isRuntimeDocumentUpdatedEvent(event, "notices")) void load(true);
    };
    void load();
    window.addEventListener(RUNTIME_DOCUMENT_UPDATED_EVENT, handleRuntimeDocumentUpdated);
    return () => {
      disposed = true;
      requestGeneration += 1;
      window.removeEventListener(RUNTIME_DOCUMENT_UPDATED_EVENT, handleRuntimeDocumentUpdated);
    };
  }, []);

  const dataAccuracyNotice = dataAccuracyNotices?.editions[siteEdition];
  const dataAccuracyNoticeTitle = dataAccuracyNotices
    ? dataAccuracyNotice?.title
    : editionProfile.noticeTitle;
  const dataAccuracyNoticeLines =
    dataAccuracyNotice?.lines ?? editionProfile.noticeLines;

  useEffect(() => {
    if (!dataAccuracyNoticeOpen) return undefined;
    if (!editionProfile.showNoticeCountdown) {
      const timeout = window.setTimeout(() => setDataAccuracyNoticeOpen(false), 10_000);
      return () => window.clearTimeout(timeout);
    }
    const deadline = Date.now() + 10_000;
    const updateCountdown = () => {
      const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setDataAccuracyNoticeSecondsLeft(secondsLeft);
      if (secondsLeft === 0) setDataAccuracyNoticeOpen(false);
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(interval);
  }, [dataAccuracyNoticeOpen, editionProfile.showNoticeCountdown]);

  const groups = useMemo(
    () => [...catalogIndex.groups].sort((left, right) => left.order - right.order),
    [catalogIndex.groups],
  );
  const activeCatalog = groupId === ALL_GROUPS ? null : catalogsByGroup[groupId] ?? null;
  const visibleCatalog = useMemo<PublicFactionCatalog | null>(() => {
    if (activeCatalog) return activeCatalog;
    if (groupId === ALL_GROUPS) return null;
    const group = catalogIndex.groups.find((candidate) => candidate.id === groupId);
    if (!group) return null;
    return {
      schemaVersion: "1.0.0",
      catalogId: catalogIndex.catalogId,
      group,
      records: catalogIndex.records
        .filter((record) => record.official.groupId === groupId)
        .map(catalogRecordFromSearchRecord),
    };
  }, [activeCatalog, catalogIndex, groupId]);
  const cardGroups = useMemo(
    () => (visibleCatalog?.records ?? []).flatMap(catalogCardGroups),
    [visibleCatalog],
  );
  const cardEntries = useMemo(
    () => cardGroups.flatMap((group) => group.entries),
    [cardGroups],
  );
  const activeCatalogError =
    groupId === ALL_GROUPS ? null : catalogErrorsByGroup[groupId] ?? null;

  const visualGroups = useMemo(
    () =>
      (siteEdition === "china" ? CHINA_FACTION_IMAGE_ORDER : FACTION_IMAGE_ORDER)
        .map((id) => groups.find((group) => group.id === id)).filter(
        (group): group is FactionGroup => group !== undefined,
      ),
    [groups, siteEdition],
  );
  useEffect(() => {
    if (siteEdition !== "international" || groupId === ALL_GROUPS) return;
    const preloadGroups = visualGroups.filter((group) => group.id === groupId);
    for (const group of preloadGroups) {
      const background = factionVisualAsset(group, siteEdition).catalogBackground;
      void preloadFactionImage(background).catch(() => undefined);
    }
  }, [groupId, siteEdition, visualGroups]);
  useEffect(() => {
    if (siteEdition !== "china") return undefined;
    const requestedFactionId = activeFactionDustId ?? morphFactionId;
    if (!requestedFactionId) return undefined;
    const group = visualGroups.find((candidate) => candidate.id === requestedFactionId);
    if (!group) return undefined;
    let cancelled = false;
    const asset = factionVisualAsset(group, siteEdition);
    void preloadFactionImage(asset.foreground).then(
      () => {
        if (cancelled) return;
        setPreloadedFactionIds((current) => {
          if (current.has(group.id)) return current;
          const next = new Set(current);
          next.add(group.id);
          return next;
        });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [activeFactionDustId, morphFactionId, siteEdition, visualGroups]);
  const previewFactionId = activeCharacterId ?? morphFactionId ?? visualGroups[0]?.id ?? null;
  const previewFaction = visualGroups.find((group) => group.id === previewFactionId) ?? visualGroups[0] ?? null;

  const hasGroupSelection = groupId !== ALL_GROUPS;
  const activeGroup = groups.find((group) => group.id === groupId) ?? null;
  const activeGroupName = activeGroup ? activeGroup.name : `${visualGroups.length} 阵营`;
  const activeGroupTitleLines = FACTION_DOCK_TITLE_LINES[activeGroupName] ?? [activeGroupName];

  useEffect(() => {
    const title = resultHeadingRef.current;
    const brand = title?.parentElement;
    if (!title || !brand) return undefined;

    let frame = 0;
    let cancelled = false;
    const scheduleFit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => fitFactionDockTitle(title));
    };
    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(brand);
    window.addEventListener("resize", scheduleFit);
    scheduleFit();
    void document.fonts.ready.then(() => {
      if (!cancelled) scheduleFit();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleFit);
    };
  }, [activeGroupName]);

  useEffect(() => {
    if (siteEdition !== "international" || !hasGroupSelection) return undefined;
    const rail = factionDockFlagsRef.current;
    if (!rail) return undefined;

    let frame = 0;
    const centerActiveFlag = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const activeFlag = rail.querySelector<HTMLButtonElement>(
          '.faction-dock__flag[data-active="true"]',
        );
        if (!activeFlag) return;
        const railRect = rail.getBoundingClientRect();
        const activeRect = activeFlag.getBoundingClientRect();
        const activeCenter =
          activeRect.left - railRect.left + rail.scrollLeft + activeRect.width / 2;
        const maximumScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
        rail.scrollTo({
          left: Math.min(
            maximumScrollLeft,
            Math.max(0, activeCenter - rail.clientWidth / 2),
          ),
          behavior: "auto",
        });
      });
    };
    const resizeObserver = new ResizeObserver(centerActiveFlag);
    resizeObserver.observe(rail);
    window.addEventListener("resize", centerActiveFlag);
    centerActiveFlag();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", centerActiveFlag);
    };
  }, [groupId, hasGroupSelection, siteEdition, visualGroups.length]);

  const globalSearchResults = useMemo(() => {
    return searchCatalogIndexRecords(catalogIndex.records, globalQuery);
  }, [catalogIndex.records, globalQuery]);

  const changeGlobalQuery = useCallback((nextQuery: string) => {
    setGlobalQuery(nextQuery);
    if (!nextQuery.trim()) return;
    void onRequestFullCatalog().catch(() => undefined);
  }, [onRequestFullCatalog]);

  useEffect(() => {
    setCatalogsByGroup({});
    setCatalogErrorsByGroup({});
  }, [catalogIndex, siteEdition]);

  const commitNavigation = useCallback(
    (
      next: {
        groupId: string;
        query: string;
        selectedId: string | null;
        viewer: ViewerNavigationState;
      },
      mode: "pushState" | "replaceState",
    ) => {
      const nextUrl = buildCatalogUrl(next, catalogIndex, { basePath: editionBasePath });
      window.history[mode](
        null,
        "",
        nextUrl,
      );
    },
    [catalogIndex, editionBasePath],
  );

  useEffect(() => {
    if (groupId === ALL_GROUPS || catalogsByGroup[groupId]) return undefined;
    let cancelled = false;
    void requestFactionCatalog(
      groupId,
      catalogIndex,
      siteEdition,
    )
      .then((document) => {
        if (cancelled) return;
        setCatalogsByGroup((current) => ({ ...current, [groupId]: document }));
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        setCatalogErrorsByGroup((current) => ({ ...current, [groupId]: message }));
      });
    return () => {
      cancelled = true;
    };
  }, [
    catalogIndex,
    catalogRetryToken,
    catalogsByGroup,
    groupId,
    siteEdition,
  ]);

  const runFactionMorph = useCallback(
    (factionId: string, update: () => void, afterUpdate?: () => void) => {
      const commitUpdate = () => {
        flushSync(update);
        afterUpdate?.();
      };
      if (typeof document.startViewTransition !== "function") {
        commitUpdate();
        return;
      }

      factionViewTransitionRef.current?.skipTransition();
      flushSync(() => setMorphFactionId(factionId));
      const transition = document.startViewTransition(commitUpdate);
      factionViewTransitionRef.current = transition;
      void transition.finished
        .catch(() => undefined)
        .finally(() => {
          if (factionViewTransitionRef.current !== transition) return;
          factionViewTransitionRef.current = null;
          setMorphFactionId(null);
        });
    },
    [],
  );

  const runDetailTransition = useCallback((update: () => void, cardId?: string | null) => {
    if (typeof document.startViewTransition !== "function") {
      update();
      return;
    }

    const transitionCard = cardId ? cardRefs.current.get(cardId) ?? null : null;
    if (transitionCard?.classList.contains("vehicle-card__livery-slice")) {
      update();
      return;
    }

    detailViewTransitionRef.current?.skipTransition();
    detailTransitionCardRef.current?.style.removeProperty("view-transition-name");
    transitionCard?.style.setProperty("view-transition-name", "vehicle-card-morph");
    detailTransitionCardRef.current = transitionCard;
    document.documentElement.dataset.detailTransition = "true";
    const transition = document.startViewTransition(() => flushSync(update));
    detailViewTransitionRef.current = transition;
    void transition.finished
      .catch(() => undefined)
      .finally(() => {
        if (detailViewTransitionRef.current === transition) {
          if (detailTransitionCardRef.current === transitionCard) {
            transitionCard?.style.removeProperty("view-transition-name");
            detailTransitionCardRef.current = null;
          }
          detailViewTransitionRef.current = null;
          delete document.documentElement.dataset.detailTransition;
        }
      });
  }, []);

  useEffect(() => {
    const applyLocation = () => {
      void onRequestLocation(window.location.href).then((nextCatalogIndex) => {
        const next = parseCatalogLocation(window.location.href, nextCatalogIndex, {
          basePath: editionBasePath,
        });
        setGroupId(next.groupId);
        setQuery(next.query);
        setSelectedId(next.selectedId);
        setViewerNavigation(next.viewer as ViewerNavigationState);
        setEncyclopediaOpen(false);
        setHelpOpen(false);
      }).catch(() => undefined);
    };
    window.addEventListener("popstate", applyLocation);
    return () => {
      window.removeEventListener("popstate", applyLocation);
    };
  }, [editionBasePath, onRequestLocation]);

  const visibleCardGroups = useMemo<VisibleCatalogCardGroup[]>(() => {
    const normalizedQuery = normalizeVehicleSearch(query);
    return cardGroups.flatMap((cardGroup) => {
      const { record } = cardGroup;
      if (groupId !== ALL_GROUPS && record.official.groupId !== groupId) return [];
      const matchingEntries = normalizedQuery
        ? cardGroup.entries.filter((card) => {
          if (card.variant) {
            return rankVehicleVariantSearch(record, card.variant, normalizedQuery) !== null;
          }
          return (
            rankVehicleSearch(record, normalizedQuery) !== null ||
            normalizeVehicleSearch(card.alias ?? "").includes(normalizedQuery)
          );
        })
        : cardGroup.entries;
      if (matchingEntries.length === 0) return [];
      const selectedEntry = cardGroup.entries.find((card) => card.cardId === selectedId);
      return [{
        ...cardGroup,
        displayCard: selectedEntry ?? matchingEntries[0] ?? cardGroup.entries[0],
      }];
    });
  }, [cardGroups, groupId, query, selectedId]);

  const selectedCard = cardEntries.find((card) => card.cardId === selectedId) ?? null;
  const selectedCardGroup = selectedId
    ? cardGroups.find((cardGroup) =>
        cardGroup.entries.some((entry) => entry.cardId === selectedId),
      ) ?? null
    : null;

  const clearFactionSelection = useCallback((source: "keyboard" | "pointer") => {
    if (!hasGroupSelection) return;
    const previousGroupId = groupId;
    selectorRef.current?.scrollIntoView({ block: "start" });
    runFactionMorph(
      previousGroupId,
      () => {
        const nextViewer = { ...DEFAULT_VIEWER_NAVIGATION_STATE } as ViewerNavigationState;
        setGroupId(ALL_GROUPS);
        setGlobalQuery("");
        setQuery("");
        setSelectedId(null);
        setViewerNavigation(nextViewer);
        setEncyclopediaOpen(false);
        setHelpOpen(false);
        commitNavigation(
          { groupId: ALL_GROUPS, query: "", selectedId: null, viewer: nextViewer },
          "pushState",
        );
      },
      () => {
        window.requestAnimationFrame(() => {
          if (source === "keyboard") {
            selectorTitleRef.current?.focus({ preventScroll: true });
          } else {
            factionButtonRefs.current.get(previousGroupId)?.focus({ preventScroll: true });
          }
        });
      },
    );
  }, [commitNavigation, groupId, hasGroupSelection, runFactionMorph, setHelpOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (contentAdminOpen) return;
      if (helpOpen) {
        setHelpOpen(false);
        window.requestAnimationFrame(() => helpButtonRef.current?.focus());
        event.preventDefault();
        return;
      }
      if (selectedId) {
        const button = cardRefs.current.get(selectedId);
        runDetailTransition(() => {
          const nextViewer = { ...DEFAULT_VIEWER_NAVIGATION_STATE } as ViewerNavigationState;
          setSelectedId(null);
          setViewerNavigation(nextViewer);
          setEncyclopediaOpen(false);
          commitNavigation(
            { groupId, query, selectedId: null, viewer: nextViewer },
            "pushState",
          );
        }, selectedId);
        window.requestAnimationFrame(() => button?.focus());
        event.preventDefault();
        return;
      }
      if (!hasGroupSelection) return;
      clearFactionSelection("keyboard");
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearFactionSelection, commitNavigation, contentAdminOpen, groupId, hasGroupSelection, helpOpen, query, runDetailTransition, selectedId]);

  const selectCard = (card: CatalogCardEntry) => {
    runDetailTransition(() => {
      const nextViewer = viewerNavigationForVehicle(card.record.promoEntryId);
      setHelpOpen(false);
      setSelectedId(card.cardId);
      setViewerNavigation(nextViewer);
      setEncyclopediaOpen(false);
      commitNavigation(
        { groupId, query, selectedId: card.cardId, viewer: nextViewer },
        "pushState",
      );
    }, card.cardId);
  };

  const selectTextureVariant = (card: CatalogCardEntry) => {
    if (selectedId === card.cardId) return;
    setHelpOpen(false);
    setSelectedId(card.cardId);
    setEncyclopediaOpen(false);
    commitNavigation(
      { groupId, query, selectedId: card.cardId, viewer: viewerNavigation },
      "replaceState",
    );
  };

  const toggleEncyclopedia = (card: CatalogCardEntry) => {
    if (selectedId === card.cardId) {
      setEncyclopediaOpen((current) => !current);
      return;
    }
    runDetailTransition(() => {
      const nextViewer = viewerNavigationForVehicle(card.record.promoEntryId);
      setHelpOpen(false);
      setSelectedId(card.cardId);
      setViewerNavigation(nextViewer);
      setEncyclopediaOpen(true);
      commitNavigation(
        { groupId, query, selectedId: card.cardId, viewer: nextViewer },
        "pushState",
      );
    }, card.cardId);
  };

  const selectGlobalSearchResult = (
    record: CatalogSearchRecord,
    variant?: CatalogSearchVariant,
  ) => {
    const nextGroupId = record.official.groupId;
    const nextCardId = variant?.cardId ?? record.defaultCardId;
    setActiveCharacterId(null);
    setActiveFactionDustId(null);
    const update = () => {
      const nextViewer = viewerNavigationForVehicle(record.promoEntryId);
      setGlobalQuery("");
      setQuery("");
      setGroupId(nextGroupId);
      setSelectedId(nextCardId);
      setViewerNavigation(nextViewer);
      setEncyclopediaOpen(false);
      setHelpOpen(false);
      commitNavigation(
        { groupId: nextGroupId, query: "", selectedId: nextCardId, viewer: nextViewer },
        "pushState",
      );
    };
    const focusResult = () => {
      window.requestAnimationFrame(() =>
        resultHeadingRef.current?.focus({ preventScroll: true }),
      );
    };
    if (hasGroupSelection) {
      update();
      focusResult();
    } else {
      runFactionMorph(nextGroupId, update, focusResult);
    }
  };

  const closeDetail = () => {
    const previous = selectedId ? cardRefs.current.get(selectedId) : null;
    runDetailTransition(() => {
      const nextViewer = { ...DEFAULT_VIEWER_NAVIGATION_STATE } as ViewerNavigationState;
      setSelectedId(null);
      setViewerNavigation(nextViewer);
      setEncyclopediaOpen(false);
      commitNavigation(
        { groupId, query, selectedId: null, viewer: nextViewer },
        "pushState",
      );
    }, selectedId);
    window.requestAnimationFrame(() => previous?.focus());
  };

  const selectFaction = async (nextGroupId: string) => {
    if (!catalogIndex.records.some((record) => record.official.groupId === nextGroupId)) {
      try {
        await onRequestGroup(nextGroupId);
      } catch {
        return;
      }
    }
    setActiveCharacterId(null);
    setActiveFactionDustId(null);
    const update = () => {
      const nextViewer = { ...DEFAULT_VIEWER_NAVIGATION_STATE } as ViewerNavigationState;
      setGlobalQuery("");
      setQuery("");
      setGroupId(nextGroupId);
      setSelectedId(null);
      setViewerNavigation(nextViewer);
      setEncyclopediaOpen(false);
      setHelpOpen(false);
      commitNavigation(
        { groupId: nextGroupId, query: "", selectedId: null, viewer: nextViewer },
        "pushState",
      );
    };
    const focusResult = () => {
      window.requestAnimationFrame(() =>
        resultHeadingRef.current?.focus({ preventScroll: true }),
      );
    };
    if (hasGroupSelection) {
      update();
      focusResult();
    } else {
      runFactionMorph(nextGroupId, update, focusResult);
    }
  };

  const changeQuery = (nextQuery: string) => {
    const nextViewer = { ...DEFAULT_VIEWER_NAVIGATION_STATE } as ViewerNavigationState;
    setQuery(nextQuery);
    setSelectedId(null);
    setViewerNavigation(nextViewer);
    setEncyclopediaOpen(false);
    commitNavigation(
      { groupId, query: nextQuery, selectedId: null, viewer: nextViewer },
      "replaceState",
    );
  };

  const updateViewerNavigation = useCallback(
    (nextViewer: ViewerNavigationState) => {
      setViewerNavigation(nextViewer);
      if (!selectedId) return;
      commitNavigation(
        { groupId, query, selectedId, viewer: nextViewer },
        "replaceState",
      );
    },
    [commitNavigation, groupId, query, selectedId],
  );

  return (
    <div
      className="site-shell"
      data-site-edition={siteEdition}
      data-faction-selected={hasGroupSelection}
      data-faction-morphing={morphFactionId !== null}
      data-detail-open={selectedCard !== null}
    >
      <a className="skip-link" href={hasGroupSelection ? "#main-content" : "#faction-selector"}>
        {hasGroupSelection ? "跳至载具目录" : "跳至阵营选择"}
      </a>
      {dataAccuracyNoticeOpen ? (
        <aside className="data-accuracy-notice" role="note" aria-label="数据准确性提示">
          <CircleAlert size={16} aria-hidden="true" />
          <div>
            {dataAccuracyNoticeTitle ? <strong>{dataAccuracyNoticeTitle}</strong> : null}
            {dataAccuracyNoticeLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {editionProfile.showNoticeCountdown ? (
              <small className="data-accuracy-notice__countdown">
                将在 {dataAccuracyNoticeSecondsLeft} 秒后自动关闭
              </small>
            ) : null}
          </div>
          <button
            className="data-accuracy-notice__close"
            type="button"
            aria-label="关闭数据准确性提示"
            onClick={() => setDataAccuracyNoticeOpen(false)}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </aside>
      ) : null}

      <section
        id="faction-selector"
        ref={selectorRef}
        className="faction-selector"
        data-selected={hasGroupSelection}
        data-morphing={morphFactionId !== null}
        data-foregrounds-preloaded={
          siteEdition === "china" ? preloadedFactionIds.size : undefined
        }
        data-choice-panel-active={choicePanelActive ? "true" : undefined}
        aria-labelledby="faction-selector-title"
        aria-describedby={
          siteEdition === "international" ? "faction-selector-ai-notice" : undefined
        }
      >
        {siteEdition === "china" ? (
          <>
            <div className="faction-selector__stage" aria-hidden="true">
              <div className="faction-selector__visual-frame">
                {/* eslint-disable-next-line @next/next/no-img-element -- exact untransformed pixels keep the alpha overlays registered to the official image */}
                <img
                  className="faction-selector__base"
                  src="/china-assets/local-preview/official/faction-impression.jpg"
                  alt=""
                />
              </div>
              <div className="faction-selector__shade" />
              <div className="faction-selector__visual-frame faction-selector__visual-frame--foregrounds">
                {visualGroups.map((group, visualIndex) => {
                  const asset = factionVisualAsset(group, siteEdition);
                  const visualStyle = chinaFactionVisualStyle(group);
                  const foregroundPreloaded = preloadedFactionIds.has(group.id);
                  const foregroundRequested =
                    foregroundPreloaded ||
                    activeFactionDustId === group.id ||
                    morphFactionId === group.id;
                  return (
                    <Fragment key={group.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- these pre-sized alpha WebPs must retain their manifest coordinates */}
                      <img
                        className="faction-selector__portrait"
                        src={
                          foregroundRequested
                            ? asset.foreground
                            : EMPTY_FACTION_FOREGROUND_SRC
                        }
                        alt=""
                        decoding="async"
                        data-visual-index={visualIndex}
                        data-foreground-requested={foregroundRequested}
                        data-foreground-preloaded={foregroundPreloaded}
                        data-morphing={morphFactionId === group.id}
                        style={visualStyle}
                      />
                      {foregroundRequested ? (
                        <span
                          className="faction-selector__dust"
                          data-active={activeFactionDustId === group.id}
                          style={{
                            ...visualStyle,
                            "--faction-dust-mask": `url("${asset.foreground}")`,
                          } as CSSProperties}
                        >
                          {FACTION_DUST_PARTICLES.map((particle, particleIndex) => (
                            <i
                              key={particleIndex}
                              style={{
                                "--dust-x": `${particle.x * 0.52}%`,
                                "--dust-y": `${10 + (particle.y - 56) * 0.72}%`,
                                "--dust-size": `${particle.size * 4}px`,
                                "--dust-dx": `calc(42vw + ${particle.dx * 0.35}px)`,
                                "--dust-dy": `calc(46svh + ${Math.abs(particle.dy) * 0.8}px)`,
                                "--dust-early-x": `calc(3vw + ${particle.mx * 0.08}px)`,
                                "--dust-early-y": `calc(4svh + ${Math.abs(particle.my) * 0.12}px)`,
                                "--dust-mid-x": `calc(18vw + ${particle.mx * 0.3}px)`,
                                "--dust-mid-y": `calc(21svh + ${Math.abs(particle.my) * 0.4}px)`,
                                "--dust-late-x": `calc(36vw + ${particle.dx * 0.28}px)`,
                                "--dust-late-y": `calc(39svh + ${Math.abs(particle.dy) * 0.62}px)`,
                                "--dust-duration": `${Math.round(particle.duration * 1.55)}ms`,
                                "--dust-delay": `${particle.delay}ms`,
                                "--dust-opacity": Math.min(1, particle.opacity + 0.18),
                                "--dust-late-opacity":
                                  Math.min(1, particle.opacity + 0.18) * 0.82,
                                "--dust-late-rotation": `${particle.rotation * 0.72}deg`,
                                "--dust-rotation": `${particle.rotation}deg`,
                              } as CSSProperties}
                            />
                          ))}
                        </span>
                      ) : null}
                    </Fragment>
                  );
                })}
              </div>
            </div>

            <header className="faction-selector__brand">
              <div className="brand-lockup brand-lockup--iron-rice-hall">
                <div className="faction-selector__brand-identity faction-selector__brand-identity--hero">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local CDN-ready brand asset preserves the complete official wordmark */}
                  <img
                    className="brand-wordmark"
                    src="/china-assets/local-preview/official/brand/iron-rice-hall-wordmark.png"
                    alt="铁皮饭堂"
                  />
                  <HomepageUtilityNav
                    siteEdition={siteEdition}
                    switchHref={editionProfile.switchHref}
                    switchLabel={editionProfile.switchLabel}
                  />
                </div>
                <span>公益项目 · 实装内容以游戏内为准 · 不代表最终品质</span>
              </div>
              <GlobalVehicleSearch
                id="homepage-vehicle-search"
                variant="hero"
                query={globalQuery}
                results={globalSearchResults}
                onQueryChange={changeGlobalQuery}
                onSelect={selectGlobalSearchResult}
              />
            </header>

            <div className="faction-selector__intro">
              <h1 id="faction-selector-title" ref={selectorTitleRef} tabIndex={-1}>
                选择你的阵营
              </h1>
            </div>

            <div className="faction-selector__choices" role="group" aria-label="选择阵营">
              {visualGroups.map((group, visualIndex) => {
                const recordCount = group.recordCount;
                return (
                  <button
                    key={group.id}
                    ref={(node) => {
                      if (node) factionButtonRefs.current.set(group.id, node);
                      else factionButtonRefs.current.delete(group.id);
                    }}
                    type="button"
                    className="faction-selector__choice"
                    data-visual-index={visualIndex}
                    aria-label={`选择${group.name}，查看 ${recordCount} 个载具家族`}
                    aria-pressed={groupId === group.id}
                    tabIndex={hasGroupSelection ? -1 : 0}
                    onPointerEnter={() => setActiveFactionDustId(group.id)}
                    onPointerLeave={(event) => {
                      if (!event.currentTarget.matches(":focus-visible")) {
                        setActiveFactionDustId((current) =>
                          current === group.id ? null : current,
                        );
                      }
                    }}
                    onFocus={() => setActiveFactionDustId(group.id)}
                    onBlur={() =>
                      setActiveFactionDustId((current) =>
                        current === group.id ? null : current,
                      )
                    }
                    onClick={() => selectFaction(group.id)}
                  >
                    <span className="faction-selector__choice-label">
                      <strong>{group.name}</strong>
                    </span>
                  </button>
                );
              })}
            </div>

            <nav className="faction-dock" aria-label="切换阵营">
              <div
                className="faction-dock__brand"
                aria-label={`铁皮饭堂 · ${activeGroupName}`}
              >
                <div className="faction-dock__brand-identity">
                  <button
                    className="faction-dock__home"
                    type="button"
                    tabIndex={hasGroupSelection ? 0 : -1}
                    aria-label="返回五阵营主界面"
                    title="返回五阵营主界面"
                    onClick={() => clearFactionSelection("pointer")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local CDN-ready brand asset preserves the complete official wordmark */}
                    <img
                      className="faction-dock__wordmark"
                      src="/china-assets/local-preview/official/brand/iron-rice-hall-wordmark.png"
                      alt="铁皮饭堂"
                    />
                  </button>
                  <DailyActiveDisplay variant="dock" />
                </div>
                <h2 id="catalog-title" ref={resultHeadingRef} tabIndex={-1}>
                  {activeGroupTitleLines.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </h2>
              </div>
              <div className="faction-dock__flags" ref={factionDockFlagsRef}>
                {visualGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className="faction-dock__flag"
                    data-active={groupId === group.id}
                    aria-label={`切换到${group.name}`}
                    aria-pressed={groupId === group.id}
                    tabIndex={hasGroupSelection ? 0 : -1}
                    onClick={() => selectFaction(group.id)}
                  >
                    <span
                      className="faction-dock__flag-shape"
                      aria-hidden="true"
                      data-morphing={morphFactionId === group.id}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- local flag asset is already sized and CDN-cacheable */}
                      <img
                        src={factionVisualAsset(group, siteEdition).logo}
                        alt=""
                      />
                    </span>
                  </button>
                ))}
              </div>
              <div className="faction-dock__actions">
                <GlobalVehicleSearch
                  id="dock-vehicle-search"
                  variant="dock"
                  query={globalQuery}
                  results={globalSearchResults}
                  onQueryChange={changeGlobalQuery}
                  onSelect={selectGlobalSearchResult}
                />
              </div>
            </nav>
          </>
        ) : (
          <>
        {!hasGroupSelection ? (
          <div className="faction-selector__stage">
            <FactionBackground
              src={
                previewFaction
                  ? factionVisualAsset(previewFaction, siteEdition).catalogBackground
                  : "/images/site/faction-impression.jpg"
              }
            />
            <div className="faction-selector__shade" aria-hidden="true" />
            <FactionCharacterWheel
              groups={visualGroups}
              activeGroupId={previewFactionId}
              siteEdition={siteEdition}
              onPreviewChange={setActiveCharacterId}
              onSelect={selectFaction}
            />
          </div>
        ) : null}

        <header className="faction-selector__brand">
          <div className="faction-selector__brand-copy">
            <div className="faction-selector__brand-title">
              <IronRiceHallWordmark className="brand-wordmark" />
              <HomepageUtilityNav
                siteEdition={siteEdition}
                switchHref={editionProfile.switchHref}
                switchLabel={editionProfile.switchLabel}
              />
              <h1 id="faction-selector-title" ref={selectorTitleRef} tabIndex={-1}>
                选择你的阵营
              </h1>
            </div>
            {previewFaction ? (
              <div className="faction-selector__preview-identity" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element -- compact local faction insignia */}
                <img src={factionVisualAsset(previewFaction, siteEdition).logo} alt="" />
                <strong>{previewFaction.id.toUpperCase()}</strong>
                <small className="faction-selector__project-note">
                  公益项目 · 以游戏内实装为准
                </small>
              </div>
            ) : null}
          </div>
          <aside
            id="faction-selector-ai-notice"
            className="faction-selector__ai-notice"
            role="note"
            aria-label="AI 形象资源声明"
          >
            <CircleAlert size={17} aria-hidden="true" />
            <p>
              <strong>AI 形象资源声明</strong>
              <span>部分形象资源由 AI 生成，可能存在武器、装备或其他细节失真，感谢您的理解与包容。</span>
            </p>
          </aside>
          <GlobalVehicleSearch
            id="homepage-vehicle-search"
            variant="hero"
            query={globalQuery}
            results={globalSearchResults}
            onQueryChange={changeGlobalQuery}
            onSelect={selectGlobalSearchResult}
          />
        </header>

        <div
          className="faction-selector__choice-panel"
          onPointerEnter={() => setChoicePanelActive(true)}
          onPointerLeave={(event) => {
            setChoicePanelActive(event.currentTarget.matches(":focus-within"));
          }}
          onFocusCapture={() => setChoicePanelActive(true)}
          onBlurCapture={(event) => {
            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
              return;
            }
            setChoicePanelActive(event.currentTarget.matches(":hover"));
          }}
        >
          <header className="faction-selector__choice-panel-heading">
            <span>
              <small>FACTION INDEX</small>
              <strong>阵营目录</strong>
            </span>
            <em>
              <b>{visualGroups.length}</b>
              <small>可选阵营</small>
            </em>
          </header>
          <div className="faction-selector__choices" role="group" aria-label="选择阵营">
            {visualGroups.map((group, visualIndex) => {
              const recordCount = group.recordCount;
              return (
                <button
                  key={group.id}
                  ref={(node) => {
                    if (node) factionButtonRefs.current.set(group.id, node);
                    else factionButtonRefs.current.delete(group.id);
                  }}
                  type="button"
                  className="faction-selector__choice"
                  data-visual-index={visualIndex}
                  data-active={previewFactionId === group.id}
                  aria-label={`选择${group.name}，查看 ${recordCount} 个载具家族`}
                  aria-pressed={groupId === group.id}
                  tabIndex={hasGroupSelection ? -1 : 0}
                  onPointerEnter={() => setActiveCharacterId(group.id)}
                  onFocus={() => setActiveCharacterId(group.id)}
                  onKeyDown={(event) => {
                    let nextIndex: number | null = null;
                    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                      nextIndex = (visualIndex + 1) % visualGroups.length;
                    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                      nextIndex = (visualIndex - 1 + visualGroups.length) % visualGroups.length;
                    } else if (event.key === "PageDown") {
                      nextIndex = Math.min(visualGroups.length - 1, visualIndex + 5);
                    } else if (event.key === "PageUp") {
                      nextIndex = Math.max(0, visualIndex - 5);
                    } else if (event.key === "Home") {
                      nextIndex = 0;
                    } else if (event.key === "End") {
                      nextIndex = visualGroups.length - 1;
                    }
                    if (nextIndex === null) return;
                    event.preventDefault();
                    const nextGroup = visualGroups[nextIndex];
                    setActiveCharacterId(nextGroup.id);
                    factionButtonRefs.current.get(nextGroup.id)?.focus();
                  }}
                  onClick={() => selectFaction(group.id)}
                >
                  <span className="faction-selector__choice-label">
                    <b className="faction-selector__choice-index">
                      {String(visualIndex + 1).padStart(2, "0")}
                    </b>
                    {/* eslint-disable-next-line @next/next/no-img-element -- faction insignia is a local, pre-sized source asset */}
                    <img
                      src={factionVisualAsset(group, siteEdition).logo}
                      alt=""
                      aria-hidden="true"
                    />
                    <span>
                      <small>{group.id.toUpperCase()}</small>
                      <strong>{group.name}</strong>
                    </span>
                    <em>
                      <b>{recordCount}</b>
                      <small>载具</small>
                    </em>
                    <ChevronRight className="faction-selector__choice-arrow" size={15} aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
          <footer className="faction-selector__choice-panel-hint" aria-hidden="true">
            <span>滚动浏览</span>
            <kbd>↑</kbd><kbd>↓</kbd>
            <span>快速定位</span>
            <kbd>PgUp</kbd><kbd>PgDn</kbd>
          </footer>
        </div>

        <nav className="faction-dock" aria-label="切换阵营">
          <div
            className="faction-dock__brand"
            aria-label={`铁皮饭堂 · ${activeGroupName}`}
          >
            <div className="faction-dock__brand-identity">
              <button
                className="faction-dock__home"
                type="button"
                tabIndex={hasGroupSelection ? 0 : -1}
                aria-label="返回阵营选择主界面"
                title="返回阵营选择主界面"
                onClick={() => clearFactionSelection("pointer")}
              >
                <IronRiceHallWordmark className="faction-dock__wordmark" />
              </button>
              <DailyActiveDisplay variant="dock" />
            </div>
            <h2 id="catalog-title" ref={resultHeadingRef} tabIndex={-1}>
              {activeGroupTitleLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h2>
          </div>
          <div className="faction-dock__flags" ref={factionDockFlagsRef}>
            {visualGroups.map((group) => {
              const flagAsset = factionVisualAsset(group, siteEdition);

              return (
                <button
                  key={group.id}
                  type="button"
                  className="faction-dock__flag"
                  data-active={groupId === group.id}
                  data-faction={group.id}
                  aria-label={`切换到${group.name}`}
                  aria-pressed={groupId === group.id}
                  tabIndex={hasGroupSelection ? 0 : -1}
                  onClick={() => selectFaction(group.id)}
                >
                  <span
                    className="faction-dock__flag-shape"
                    aria-hidden="true"
                    data-morphing={morphFactionId === group.id}
                    style={
                      morphFactionId === group.id && hasGroupSelection
                        ? { viewTransitionName: "faction-selection-morph" }
                        : undefined
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local flag asset is already optimized and CDN-cacheable */}
                    <img className="faction-dock__flag-image" src={flagAsset.logo} alt="" />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="faction-dock__actions">
            <DailyActiveDisplay variant="dock-mobile" />
            <GlobalVehicleSearch
              id="dock-vehicle-search"
              variant="dock"
              query={globalQuery}
              results={globalSearchResults}
              onQueryChange={changeGlobalQuery}
              onSelect={selectGlobalSearchResult}
            />
          </div>
        </nav>
          </>
        )}

      </section>

      <div
        className="catalog-reveal"
        data-active={hasGroupSelection}
        data-detail-open={selectedCard !== null}
        inert={!hasGroupSelection}
      >
        <div
          className="catalog-reveal__inner"
          style={factionCatalogStyle(activeGroup, siteEdition)}
        >
          <main
            id="main-content"
            className="catalog-main"
            data-detail-open={selectedCard !== null}
            aria-labelledby="catalog-title"
          >
            <p className="sr-only" aria-live="polite">
              当前阵营 {visibleCardGroups.length} 张载具配置卡片
            </p>

            <div className="catalog-workspace" data-detail-open={selectedCard !== null}>
              <div className="catalog-results">
                {!activeCatalog && !activeCatalogError && visibleCardGroups.length === 0 ? (
                  <div className="no-results" role="status" aria-live="polite">
                    <Clock3 size={28} aria-hidden="true" />
                    <h3>正在加载当前阵营资料</h3>
                    <p>仅请求所选阵营，不会下载其他阵营的完整数据。</p>
                  </div>
                ) : activeCatalogError && !activeCatalog ? (
                  <div className="no-results" role="alert">
                    <CircleAlert size={28} aria-hidden="true" />
                    <h3>当前阵营资料加载失败</h3>
                    <p>{activeCatalogError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        factionCatalogRequests.delete(groupId);
                        setCatalogErrorsByGroup((current) => {
                          const next = { ...current };
                          delete next[groupId];
                          return next;
                        });
                        setCatalogRetryToken((current) => current + 1);
                      }}
                    >
                      重试加载
                    </button>
                  </div>
                ) : visibleCardGroups.length === 0 ? (
                  <div className="no-results">
                    <Search size={28} aria-hidden="true" />
                    <h3>当前阵营没有匹配条目</h3>
                    <p>搜索只会匹配官网宣传闭集中的载具。</p>
                    <button type="button" onClick={() => changeQuery("")}>清除搜索</button>
                  </div>
                ) : (
                  groups.map((group) => {
                    const groupCards = visibleCardGroups.filter(
                      (cardGroup) => cardGroup.record.official.groupId === group.id,
                    );
                    if (groupCards.length === 0) return null;
                    const typeGroups = new Map<string, VisibleCatalogCardGroup[]>();
                    for (const cardGroup of groupCards) {
                      const { record } = cardGroup;
                      const typeName = record.official.typeZh || "其他载具";
                      const typeCards = typeGroups.get(typeName) ?? [];
                      typeCards.push(cardGroup);
                      typeGroups.set(typeName, typeCards);
                    }
                    const renderCard = (cardGroup: VisibleCatalogCardGroup) => {
                      const card = cardGroup.displayCard;
                      const groupSelected = cardGroup.entries.some(
                        (entry) => entry.cardId === selectedId,
                      );
                      return (
                      <VehicleCard
                        key={cardGroup.groupId}
                        card={card}
                        siteEdition={siteEdition}
                        liveryOptions={cardGroup.entries}
                        selected={groupSelected}
                        thumbnailMode={selectedCard !== null}
                        encyclopediaOpen={groupSelected && encyclopediaOpen}
                        onSelect={selectCard}
                        onToggleEncyclopedia={() => toggleEncyclopedia(card)}
                        buttonRef={(cardId, node) => {
                          if (node) cardRefs.current.set(cardId, node);
                          else cardRefs.current.delete(cardId);
                        }}
                      />
                      );
                    };
                    return (
                      <section className="faction-section" key={group.id} aria-label={`${group.name}载具`}>
                        <div className="vehicle-type-groups">
                          {[...typeGroups].map(([typeName, typeCards], typeIndex) => {
                            const headingId = `vehicle-type-${group.id}-${typeIndex}`;
                            const typeNameZh = typeCards[0]?.record.official.typeNameZh ?? null;
                            return (
                              <section
                                className="vehicle-type-group"
                                key={typeName}
                                aria-labelledby={headingId}
                                data-card-count={typeCards.length}
                                style={vehicleTypeLayoutStyle(typeCards.length)}
                              >
                                <header className="vehicle-type-group__heading">
                                  <h4 id={headingId}>
                                    {typeName}
                                    {typeNameZh ? <small>{typeNameZh}</small> : null}
                                  </h4>
                                  <span>{typeCards.length} {typeCards.length === 1 ? "CARD" : "CARDS"}</span>
                                </header>
                                <ul className="vehicle-grid">
                                  {typeCards.map((cardGroup) => renderCard(cardGroup))}
                                </ul>
                              </section>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })
                )}
              </div>

              {selectedCard && (
                <button
                  className="detail-backdrop"
                  type="button"
                  aria-label="关闭载具详情"
                  onClick={closeDetail}
                />
              )}
              <DetailPanel
                card={selectedCard}
                siteEdition={siteEdition}
                textureVariants={selectedCardGroup?.entries ?? (selectedCard ? [selectedCard] : [])}
                onTextureVariantSelect={selectTextureVariant}
                onClose={closeDetail}
                encyclopediaOpen={encyclopediaOpen}
                viewerNavigation={viewerNavigation}
                onViewerNavigationChange={updateViewerNavigation}
              />
            </div>
          </main>
        </div>
      </div>
      <SiteFooter
        variant={hasGroupSelection ? "catalog" : "faction"}
        siteEdition={siteEdition}
      />
      <SiteFooterHelp
        helpOpen={helpOpen}
        docked={selectedCard !== null}
        helpButtonRef={helpButtonRef}
        helpId="vehicle-crew-help"
        onToggle={() => setHelpOpen((open) => !open)}
        onClose={() => {
          setHelpOpen(false);
          helpButtonRef.current?.focus();
        }}
        onOpenContentAdmin={() => {
          setHelpOpen(false);
          setContentAdminOpen(true);
        }}
      />
      {contentAdminOpen ? (
        <Suspense fallback={null}>
          <SiteContentAdminModal
            initialEdition={siteEdition}
            onClose={closeContentAdmin}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
