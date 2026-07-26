"use client";

import { useEffect, useState } from "react";

import {
  parseSupportersDocument,
  SUPPORTERS_DOCUMENT_URL,
  SUPPORTERS_REFRESH_MS,
} from "../lib/supporters-document.mjs";
import {
  isRuntimeDocumentUpdatedEvent,
  RUNTIME_DOCUMENT_UPDATED_EVENT,
} from "../lib/runtime-document-events";

type SupportersDocument = NonNullable<ReturnType<typeof parseSupportersDocument>>;
type SupporterEntry = SupportersDocument["entries"][number];

let cachedSupportersDocument: SupportersDocument | null = null;
let activeSupportersRequest: Promise<SupportersDocument> | null = null;
let lastSupportersRequestStartedAt = 0;
let supportersRequestGeneration = 0;

async function requestSupportersDocument(documentUrl: string, force = false) {
  if (!force && activeSupportersRequest) return activeSupportersRequest;
  const now = Date.now();
  if (!force && now - lastSupportersRequestStartedAt < SUPPORTERS_REFRESH_MS) {
    return cachedSupportersDocument;
  }
  lastSupportersRequestStartedAt = now;
  if (force) supportersRequestGeneration += 1;
  const generation = supportersRequestGeneration;
  const requestUrl = force
    ? `${documentUrl}${documentUrl.includes("?") ? "&" : "?"}admin_refresh=${now}`
    : documentUrl;

  const request = (async () => {
    const response = await fetch(requestUrl, {
      cache: force ? "no-store" : "default",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`supporters request failed with HTTP ${response.status}`);
    const parsed = parseSupportersDocument(await response.json());
    if (!parsed) throw new Error("supporters document failed validation");
    if (generation === supportersRequestGeneration) cachedSupportersDocument = parsed;
    return parsed;
  })();
  activeSupportersRequest = request;
  try {
    return await request;
  } finally {
    if (activeSupportersRequest === request) activeSupportersRequest = null;
  }
}

function SupporterName({
  name,
  nameSegments,
}: Pick<SupporterEntry, "name" | "nameSegments">) {
  const segments = nameSegments ?? [{ text: name, color: "#fffdf0" }];
  return (
    <span className="site-footer__supporter-name" aria-label={name}>
      {segments.map((segment, index) => (
        <span
          className="site-footer__supporter-name-segment"
          style={{ color: segment.color }}
          aria-hidden="true"
          key={`${index}-${segment.text}`}
        >
          {segment.text}
        </span>
      ))}
    </span>
  );
}

export function SiteFooterSupporters({
  documentUrl = SUPPORTERS_DOCUMENT_URL,
}: {
  documentUrl?: string;
}) {
  const [supportersDocument, setSupportersDocument] = useState<SupportersDocument | null>(
    cachedSupportersDocument,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;

    let loadSequence = 0;
    const load = async (force = false) => {
      const sequence = ++loadSequence;
      try {
        const parsed = await requestSupportersDocument(documentUrl, force);
        if (!disposed && sequence === loadSequence && parsed) {
          setSupportersDocument(parsed);
          setFailed(false);
        }
      } catch {
        if (!disposed && sequence === loadSequence) setFailed(true);
      }
    };

    void load();
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, SUPPORTERS_REFRESH_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    const handleRuntimeDocumentUpdated = (event: Event) => {
      if (isRuntimeDocumentUpdatedEvent(event, "supporters")) void load(true);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener(
      RUNTIME_DOCUMENT_UPDATED_EVENT,
      handleRuntimeDocumentUpdated,
    );

    return () => {
      disposed = true;
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener(
        RUNTIME_DOCUMENT_UPDATED_EVENT,
        handleRuntimeDocumentUpdated,
      );
    };
  }, [documentUrl]);

  const entries = supportersDocument?.entries ?? [];
  const status = failed
    ? "名单暂时无法加载，不影响其他功能。"
    : supportersDocument
      ? "当前暂无公开赞助与友链。"
      : "正在读取最新名单…";

  return (
    <section className="site-footer__supporters" aria-label="赞助名单与友链">
      <div className="site-footer__supporters-intro">
        <h3>赞助名单/友链</h3>
        <p>感谢每一位支持者，您可以赞助或协助宣传本项目。<span className="site-footer__supporters-nowrap">名单与友链将持续更新。</span></p>
      </div>
      {entries.length > 0 ? (
        <ul className="site-footer__supporters-list">
          {entries.map((entry) => (
            <li key={entry.id} data-kind={entry.kind}>
              {entry.url ? (
                <a href={entry.url} target="_blank" rel="noreferrer">
                  <SupporterName
                    name={entry.name}
                    nameSegments={entry.nameSegments}
                  />
                </a>
              ) : (
                <strong>
                  <SupporterName
                    name={entry.name}
                    nameSegments={entry.nameSegments}
                  />
                </strong>
              )}
              {entry.note ? (
                <span className="site-footer__supporter-note">{entry.note}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p
          className="site-footer__supporters-status"
          data-state={failed ? "error" : supportersDocument ? "empty" : "loading"}
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
      )}
    </section>
  );
}
