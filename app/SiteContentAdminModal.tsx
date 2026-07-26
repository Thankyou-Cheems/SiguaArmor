"use client";

import {
  ArrowDown,
  ArrowUp,
  KeyRound,
  LogOut,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  parseSupportersDocument,
} from "../lib/supporters-document.mjs";
import {
  parseUpdatesDocument,
} from "../lib/updates-document.mjs";
import {
  dispatchRuntimeDocumentUpdated,
  type RuntimeDocumentName,
} from "../lib/runtime-document-events";
import type { SiteEdition } from "./site-edition";

type SupportersDocument = NonNullable<ReturnType<typeof parseSupportersDocument>>;
type SupporterEntry = SupportersDocument["entries"][number];
type UpdatesDocument = NonNullable<ReturnType<typeof parseUpdatesDocument>>;
type UpdateEntry = UpdatesDocument["entries"][number];
type AdminDocumentName = RuntimeDocumentName;

interface LoadedDocument<T> {
  document: T;
  etag: string;
}

interface LoadedDocuments {
  supporters: LoadedDocument<SupportersDocument>;
  "updates-china": LoadedDocument<UpdatesDocument>;
  "updates-international": LoadedDocument<UpdatesDocument>;
}

interface SessionResponse {
  authenticated: true;
  csrfToken: string;
  expiresAt: string;
}

const API_ROOT = "/__admin/content";
const DEFAULT_SUPPORTER_TEXT_COLOR = "#ffffff";
const DEFAULT_SUPPORTER_ACCENT_COLOR = "#e1c89b";
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const DOCUMENT_LABELS: Record<AdminDocumentName, string> = {
  supporters: "赞助名单",
  "updates-china": "国服更新日志",
  "updates-international": "国际版更新日志",
};

class AdminRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function requestAdminJson<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });
  const value = await response.json().catch(() => null) as
    | T
    | { error?: string }
    | null;
  if (!response.ok) {
    const message =
      value &&
      typeof value === "object" &&
      "error" in value &&
      typeof value.error === "string"
        ? value.error
        : `请求失败（HTTP ${response.status}）`;
    throw new AdminRequestError(response.status, message);
  }
  return { response, value: value as T };
}

function replaceAt<T>(values: readonly T[], index: number, value: T) {
  return values.map((current, currentIndex) => (currentIndex === index ? value : current));
}

function moveAt<T>(values: readonly T[], index: number, offset: -1 | 1) {
  const target = index + offset;
  if (target < 0 || target >= values.length) return [...values];
  const next = [...values];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function temporaryId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`.slice(0, 64);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeSupportersDocument(document: SupportersDocument) {
  return {
    ...document,
    entries: document.entries.map((entry) => {
      const nameSegments = (
        entry.nameSegments ?? [
          {
            text: entry.name,
            color: DEFAULT_SUPPORTER_TEXT_COLOR,
          },
        ]
      )
        .map((segment) => ({
          text: segment.text.trim(),
          color: segment.color.trim().toLowerCase(),
        }))
        .filter((segment) => segment.text);
      const normalized: SupporterEntry = {
        id: entry.id.trim(),
        name: nameSegments.map((segment) => segment.text).join(""),
        nameSegments,
        kind: entry.kind,
      };
      const url = entry.url?.trim();
      const note = entry.note?.trim();
      if (url) normalized.url = url;
      if (note) normalized.note = note;
      return normalized;
    }),
  };
}

function normalizeUpdatesDocument(document: UpdatesDocument) {
  return {
    ...document,
    entries: document.entries.map((entry) => ({
      id: entry.id.trim(),
      date: entry.date,
      title: entry.title.trim(),
      items: entry.items.map((item) => item.trim()).filter(Boolean),
    })),
  };
}

function SupportersEditor({
  document,
  onChange,
}: {
  document: SupportersDocument;
  onChange: (document: SupportersDocument) => void;
}) {
  const updateEntry = (index: number, entry: SupporterEntry) => {
    onChange({ ...document, entries: replaceAt(document.entries, index, entry) });
  };
  const editableNameSegments = (entry: SupporterEntry) =>
    entry.nameSegments ?? [
      {
        text: entry.name,
        color: DEFAULT_SUPPORTER_TEXT_COLOR,
      },
    ];
  const updateNameSegments = (
    index: number,
    entry: SupporterEntry,
    nameSegments: NonNullable<SupporterEntry["nameSegments"]>,
  ) => {
    updateEntry(index, {
      ...entry,
      name: nameSegments.map((segment) => segment.text).join(""),
      nameSegments,
    });
  };
  return (
    <div className="site-content-admin__entries">
      {document.entries.map((entry, index) => {
        const nameSegments = editableNameSegments(entry);
        return (
          <article className="site-content-admin__entry-card" key={`${entry.id}-${index}`}>
          <header>
            <strong>名单项 {String(index + 1).padStart(2, "0")}</strong>
            <div className="site-content-admin__entry-actions">
              <button
                type="button"
                aria-label="上移名单项"
                disabled={index === 0}
                onClick={() =>
                  onChange({
                    ...document,
                    entries: moveAt(document.entries, index, -1),
                  })
                }
              >
                <ArrowUp size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="下移名单项"
                disabled={index === document.entries.length - 1}
                onClick={() =>
                  onChange({
                    ...document,
                    entries: moveAt(document.entries, index, 1),
                  })
                }
              >
                <ArrowDown size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="删除名单项"
                onClick={() =>
                  onChange({
                    ...document,
                    entries: document.entries.filter((_, entryIndex) => entryIndex !== index),
                  })
                }
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          </header>
          <div className="site-content-admin__field-grid">
            <label>
              <span>稳定 ID</span>
              <input
                value={entry.id}
                maxLength={64}
                pattern="[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?"
                title="仅使用小写英文字母、数字和连字符"
                onChange={(event) => updateEntry(index, { ...entry, id: event.target.value })}
              />
            </label>
            <label>
              <span>完整名称预览</span>
              <input
                value={entry.name}
                maxLength={40}
                readOnly
                aria-describedby={`supporter-name-segments-${index}`}
              />
            </label>
            <label>
              <span>类型</span>
              <select
                value={entry.kind}
                onChange={(event) =>
                  updateEntry(index, {
                    ...entry,
                    kind: event.target.value as SupporterEntry["kind"],
                  })
                }
              >
                <option value="sponsor">赞助者</option>
                <option value="friend">友链</option>
              </select>
            </label>
            <label className="site-content-admin__field-wide">
              <span>HTTPS 主页（可选）</span>
              <input
                type="url"
                value={entry.url ?? ""}
                maxLength={2048}
                onChange={(event) =>
                  updateEntry(index, {
                    ...entry,
                    url: event.target.value || undefined,
                  })
                }
              />
            </label>
            <label className="site-content-admin__field-wide">
              <span>备注（可选）</span>
              <input
                value={entry.note ?? ""}
                maxLength={120}
                onChange={(event) =>
                  updateEntry(index, {
                    ...entry,
                    note: event.target.value || undefined,
                  })
                }
              />
            </label>
            <div
              className="site-content-admin__name-segments site-content-admin__field-wide"
              id={`supporter-name-segments-${index}`}
            >
              <header>
                <div>
                  <span>名称分段与颜色</span>
                  <small>名称内部不会插入竖线；各段会连续显示。</small>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateNameSegments(index, entry, [
                      ...nameSegments,
                      {
                        text: "新文字",
                        color: DEFAULT_SUPPORTER_ACCENT_COLOR,
                      },
                    ])
                  }
                  disabled={nameSegments.length >= 8}
                >
                  <Plus size={13} aria-hidden="true" />
                  添加颜色段
                </button>
              </header>
              <div className="site-content-admin__name-segment-list">
                {nameSegments.map((segment, segmentIndex) => (
                  <div
                    className="site-content-admin__name-segment"
                    key={`${segmentIndex}-${segment.text}`}
                  >
                    <label>
                      <span>第 {segmentIndex + 1} 段文字</span>
                      <input
                        value={segment.text}
                        maxLength={40}
                        onChange={(event) =>
                          updateNameSegments(
                            index,
                            entry,
                            replaceAt(nameSegments, segmentIndex, {
                              ...segment,
                              text: event.target.value,
                            }),
                          )
                        }
                      />
                    </label>
                    <label className="site-content-admin__color-field">
                      <span>颜色</span>
                      <span>
                        <input
                          type="color"
                          value={
                            HEX_COLOR_PATTERN.test(segment.color)
                              ? segment.color
                              : DEFAULT_SUPPORTER_TEXT_COLOR
                          }
                          aria-label={`第 ${segmentIndex + 1} 段颜色选择器`}
                          onChange={(event) =>
                            updateNameSegments(
                              index,
                              entry,
                              replaceAt(nameSegments, segmentIndex, {
                                ...segment,
                                color: event.target.value.toLowerCase(),
                              }),
                            )
                          }
                        />
                        <input
                          value={segment.color}
                          maxLength={7}
                          pattern="#[0-9a-f]{6}"
                          aria-label={`第 ${segmentIndex + 1} 段十六进制颜色`}
                          onChange={(event) =>
                            updateNameSegments(
                              index,
                              entry,
                              replaceAt(nameSegments, segmentIndex, {
                                ...segment,
                                color: event.target.value.toLowerCase(),
                              }),
                            )
                          }
                        />
                      </span>
                    </label>
                    <div className="site-content-admin__name-segment-actions">
                      <button
                        type="button"
                        aria-label={`上移第 ${segmentIndex + 1} 段`}
                        disabled={segmentIndex === 0}
                        onClick={() =>
                          updateNameSegments(
                            index,
                            entry,
                            moveAt(nameSegments, segmentIndex, -1),
                          )
                        }
                      >
                        <ArrowUp size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`下移第 ${segmentIndex + 1} 段`}
                        disabled={segmentIndex === nameSegments.length - 1}
                        onClick={() =>
                          updateNameSegments(
                            index,
                            entry,
                            moveAt(nameSegments, segmentIndex, 1),
                          )
                        }
                      >
                        <ArrowDown size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`删除第 ${segmentIndex + 1} 段`}
                        disabled={nameSegments.length === 1}
                        onClick={() =>
                          updateNameSegments(
                            index,
                            entry,
                            nameSegments.filter(
                              (_, currentIndex) => currentIndex !== segmentIndex,
                            ),
                          )
                        }
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
        );
      })}
      <button
        className="site-content-admin__add"
        type="button"
        onClick={() =>
          onChange({
            ...document,
            entries: [
              ...document.entries,
              {
                id: temporaryId("supporter"),
                name: "",
                nameSegments: [
                  {
                    text: "",
                    color: DEFAULT_SUPPORTER_TEXT_COLOR,
                  },
                ],
                kind: "sponsor",
              },
            ],
          })
        }
      >
        <Plus size={15} aria-hidden="true" />
        添加名单项
      </button>
    </div>
  );
}

function UpdatesEditor({
  document,
  onChange,
}: {
  document: UpdatesDocument;
  onChange: (document: UpdatesDocument) => void;
}) {
  const updateEntry = (index: number, entry: UpdateEntry) => {
    onChange({ ...document, entries: replaceAt(document.entries, index, entry) });
  };
  return (
    <div className="site-content-admin__entries">
      {document.entries.map((entry, index) => (
        <article className="site-content-admin__entry-card" key={`${entry.id}-${index}`}>
          <header>
            <strong>更新项 {String(index + 1).padStart(2, "0")}</strong>
            <div className="site-content-admin__entry-actions">
              <button
                type="button"
                aria-label="上移更新项"
                disabled={index === 0}
                onClick={() =>
                  onChange({
                    ...document,
                    entries: moveAt(document.entries, index, -1),
                  })
                }
              >
                <ArrowUp size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="下移更新项"
                disabled={index === document.entries.length - 1}
                onClick={() =>
                  onChange({
                    ...document,
                    entries: moveAt(document.entries, index, 1),
                  })
                }
              >
                <ArrowDown size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="删除更新项"
                disabled={document.entries.length === 1}
                onClick={() =>
                  onChange({
                    ...document,
                    entries: document.entries.filter((_, entryIndex) => entryIndex !== index),
                  })
                }
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          </header>
          <div className="site-content-admin__field-grid">
            <label>
              <span>稳定 ID</span>
              <input
                value={entry.id}
                maxLength={64}
                pattern="[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?"
                title="仅使用小写英文字母、数字和连字符"
                onChange={(event) => updateEntry(index, { ...entry, id: event.target.value })}
              />
            </label>
            <label>
              <span>日期</span>
              <input
                type="date"
                value={entry.date}
                onChange={(event) => updateEntry(index, { ...entry, date: event.target.value })}
              />
            </label>
            <label className="site-content-admin__field-wide">
              <span>标题</span>
              <input
                value={entry.title}
                maxLength={80}
                onChange={(event) => updateEntry(index, { ...entry, title: event.target.value })}
              />
            </label>
            <label className="site-content-admin__field-wide">
              <span>更新内容（每行一条，最多 12 条）</span>
              <textarea
                value={entry.items.join("\n")}
                rows={Math.max(3, Math.min(8, entry.items.length + 1))}
                placeholder="每行一条；每条最多 240 个字符"
                onChange={(event) =>
                  updateEntry(index, {
                    ...entry,
                    items: event.target.value.split("\n"),
                  })
                }
              />
            </label>
          </div>
        </article>
      ))}
      <button
        className="site-content-admin__add"
        type="button"
        onClick={() =>
          onChange({
            ...document,
            entries: [
              {
                id: temporaryId(`${today()}-update`),
                date: today(),
                title: "",
                items: [""],
              },
              ...document.entries,
            ],
          })
        }
      >
        <Plus size={15} aria-hidden="true" />
        添加最新更新
      </button>
    </div>
  );
}

export function SiteContentAdminModal({
  initialEdition,
  onClose,
}: {
  initialEdition: SiteEdition;
  onClose: () => void;
}) {
  const [sessionState, setSessionState] = useState<"checking" | "locked" | "ready">(
    "checking",
  );
  const [managementKey, setManagementKey] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [documents, setDocuments] = useState<LoadedDocuments | null>(null);
  const [activeDocument, setActiveDocument] = useState<AdminDocumentName>(
    initialEdition === "china" ? "updates-china" : "updates-international",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const keyInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocuments = useCallback(async () => {
    const names: AdminDocumentName[] = [
      "supporters",
      "updates-china",
      "updates-international",
    ];
    const loaded = await Promise.all(
      names.map(async (documentName) => {
        const result = await requestAdminJson<{
          documentName: AdminDocumentName;
          document: SupportersDocument | UpdatesDocument;
        }>(`/documents/${documentName}`);
        const etag = result.response.headers.get("etag");
        if (!etag) throw new Error("管理接口未返回文档版本标识");
        return [documentName, { document: result.value.document, etag }] as const;
      }),
    );
    setDocuments(Object.fromEntries(loaded) as unknown as LoadedDocuments);
  }, []);

  useEffect(() => {
    let disposed = false;
    const boot = async () => {
      try {
        const result = await requestAdminJson<SessionResponse>("/session");
        if (disposed) return;
        setCsrfToken(result.value.csrfToken);
        setExpiresAt(result.value.expiresAt);
        await loadDocuments();
        if (!disposed) setSessionState("ready");
      } catch (requestError) {
        if (disposed) return;
        if (requestError instanceof AdminRequestError && requestError.status === 401) {
          setSessionState("locked");
          window.requestAnimationFrame(() => keyInputRef.current?.focus());
        } else {
          setSessionState("locked");
          setError(requestError instanceof Error ? requestError.message : "管理接口暂时不可用");
        }
      }
    };
    void boot();
    return () => {
      disposed = true;
    };
  }, [loadDocuments]);

  useEffect(() => {
    if (sessionState !== "locked") return;
    setManagementKey("");
    const clearAndFocusKeyInput = () => {
      if (!keyInputRef.current) return;
      keyInputRef.current.value = "";
      keyInputRef.current.focus();
    };
    clearAndFocusKeyInput();
    const animationFrame = window.requestAnimationFrame(clearAndFocusKeyInput);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [sessionState]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    const submittedKey = managementKey;
    setManagementKey("");
    if (keyInputRef.current) keyInputRef.current.value = "";
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestAdminJson<SessionResponse>("/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: submittedKey }),
      });
      setCsrfToken(result.value.csrfToken);
      setExpiresAt(result.value.expiresAt);
      await loadDocuments();
      setSessionState("ready");
    } catch (requestError) {
      setError(
        requestError instanceof AdminRequestError && requestError.status === 429
          ? "尝试次数过多，请稍后再试。"
          : requestError instanceof Error
            ? requestError.message
            : "验证失败",
      );
      window.requestAnimationFrame(() => keyInputRef.current?.focus());
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      await requestAdminJson<{ authenticated: false }>("/session", {
        method: "DELETE",
        headers: { "X-CSRF-Token": csrfToken },
      });
    } finally {
      setManagementKey("");
      if (keyInputRef.current) keyInputRef.current.value = "";
      setDocuments(null);
      setCsrfToken("");
      setExpiresAt("");
      setSessionState("locked");
      setBusy(false);
      window.requestAnimationFrame(() => keyInputRef.current?.focus());
    }
  };

  const save = async () => {
    if (!documents) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const current = documents[activeDocument];
      const normalized =
        activeDocument === "supporters"
          ? normalizeSupportersDocument(current.document as SupportersDocument)
          : normalizeUpdatesDocument(current.document as UpdatesDocument);
      const valid =
        activeDocument === "supporters"
          ? parseSupportersDocument(normalized)
          : parseUpdatesDocument(normalized);
      if (!valid) {
        throw new Error(
          activeDocument === "supporters"
            ? "名单字段不完整、ID 重复或链接不是安全的 HTTPS 地址。"
            : "更新日志字段不完整、日期顺序错误，或单项内容超过限制。",
        );
      }
      const result = await requestAdminJson<{
        documentName: AdminDocumentName;
        document: SupportersDocument | UpdatesDocument;
        publishedAt: string;
      }>(`/documents/${activeDocument}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": current.etag,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ document: valid }),
      });
      const etag = result.response.headers.get("etag");
      if (!etag) throw new Error("保存成功，但服务端未返回新版本标识");
      setDocuments((previous) =>
        previous
          ? {
              ...previous,
              [activeDocument]: {
                document: result.value.document,
                etag,
              },
            }
          : previous,
      );
      dispatchRuntimeDocumentUpdated(activeDocument);
      setNotice(
        `${DOCUMENT_LABELS[activeDocument]}已保存；当前页面会立即刷新，CDN 最多 60 秒完成全网更新。`,
      );
    } catch (requestError) {
      if (requestError instanceof AdminRequestError && requestError.status === 412) {
        setError("文档已被其他会话修改，请重新载入后再保存。");
      } else if (requestError instanceof AdminRequestError && requestError.status === 401) {
        setSessionState("locked");
        setDocuments(null);
        setCsrfToken("");
        setError("管理会话已过期，请重新输入密钥。");
      } else {
        setError(requestError instanceof Error ? requestError.message : "保存失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const reload = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await loadDocuments();
      setNotice("已重新载入服务器上的最新内容。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "载入失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="site-content-admin-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-content-admin-title"
    >
      <button
        className="site-content-admin-modal__backdrop"
        type="button"
        aria-label="关闭内容管理"
        onClick={onClose}
      />
      <section ref={dialogRef} className="site-content-admin-dialog">
        <header className="site-content-admin-dialog__header">
          <div>
            <small>CONTENT CONTROL</small>
            <strong id="site-content-admin-title">运行时内容管理</strong>
          </div>
          <button
            ref={closeButtonRef}
            className="site-content-admin-dialog__close"
            type="button"
            aria-label="关闭内容管理"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {sessionState === "checking" ? (
          <div className="site-content-admin__loading" role="status">
            正在检查管理会话…
          </div>
        ) : null}

        {sessionState === "locked" ? (
          <form
            className="site-content-admin__login"
            autoComplete="off"
            onSubmit={authenticate}
          >
            <span className="site-content-admin__login-icon" aria-hidden="true">
              <KeyRound size={25} />
            </span>
            <div>
              <strong>输入管理密钥</strong>
              <p>密钥仅发送到同源管理接口，不会写入浏览器存储或站点静态文件。</p>
            </div>
            <label>
              <span>管理密钥</span>
              <input
                ref={keyInputRef}
                type="password"
                value={managementKey}
                autoComplete="new-password"
                spellCheck={false}
                disabled={busy}
                onChange={(event) => setManagementKey(event.target.value)}
              />
            </label>
            <button type="submit" disabled={busy || managementKey.length === 0}>
              <KeyRound size={16} aria-hidden="true" />
              {busy ? "正在验证…" : "解锁内容管理"}
            </button>
          </form>
        ) : null}

        {sessionState === "ready" && documents ? (
          <>
            <div className="site-content-admin__toolbar">
              <div
                className="site-content-admin__tabs"
                role="tablist"
                aria-label="选择要管理的运行时文档"
              >
                {(Object.keys(DOCUMENT_LABELS) as AdminDocumentName[]).map((documentName) => (
                  <button
                    key={documentName}
                    type="button"
                    role="tab"
                    aria-selected={activeDocument === documentName}
                    data-active={activeDocument === documentName}
                    onClick={() => {
                      setActiveDocument(documentName);
                      setError("");
                      setNotice("");
                    }}
                  >
                    {DOCUMENT_LABELS[documentName]}
                  </button>
                ))}
              </div>
              <div className="site-content-admin__session-actions">
                <button type="button" disabled={busy} onClick={() => void reload()}>
                  重新载入
                </button>
                <button type="button" disabled={busy} onClick={() => void logout()}>
                  <LogOut size={14} aria-hidden="true" />
                  退出
                </button>
              </div>
            </div>
            <div
              className="site-content-admin__editor"
              role="tabpanel"
              aria-label={DOCUMENT_LABELS[activeDocument]}
            >
              {activeDocument === "supporters" ? (
                <SupportersEditor
                  document={documents.supporters.document}
                  onChange={(document) =>
                    setDocuments((previous) =>
                      previous
                        ? {
                            ...previous,
                            supporters: { ...previous.supporters, document },
                          }
                        : previous,
                    )
                  }
                />
              ) : (
                <UpdatesEditor
                  document={documents[activeDocument].document as UpdatesDocument}
                  onChange={(document) =>
                    setDocuments((previous) =>
                      previous
                        ? {
                            ...previous,
                            [activeDocument]: {
                              ...previous[activeDocument],
                              document,
                            },
                          }
                        : previous,
                    )
                  }
                />
              )}
            </div>
            <footer className="site-content-admin__savebar">
              <div>
                <span>会话到期</span>
                <time dateTime={expiresAt}>
                  {new Date(expiresAt).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <button type="button" disabled={busy} onClick={() => void save()}>
                <Save size={16} aria-hidden="true" />
                {busy ? "正在保存…" : `保存${DOCUMENT_LABELS[activeDocument]}`}
              </button>
            </footer>
          </>
        ) : null}

        {error ? (
          <p className="site-content-admin__status" data-state="error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="site-content-admin__status" data-state="success" role="status">
            {notice}
          </p>
        ) : null}
      </section>
    </div>
  );
}
