"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import chinaUpdatesSeed from "./updates-china-seed.json";
import updatesSeed from "./updates-seed.json";
import {
  formatSiteUpdatedOn,
  parseUpdatesDocument,
  UPDATES_DOCUMENT_URL,
  UPDATES_REFRESH_MS,
} from "../lib/updates-document.mjs";
import type { SiteEdition } from "./site-edition";

export type UpdatesDocument = NonNullable<ReturnType<typeof parseUpdatesDocument>>;

const parsedUpdatesSeed = parseUpdatesDocument(updatesSeed);
if (!parsedUpdatesSeed) throw new Error("bundled updates seed failed validation");
const bundledUpdatesSeed: UpdatesDocument = parsedUpdatesSeed;
const parsedChinaUpdatesSeed = parseUpdatesDocument(chinaUpdatesSeed);
if (!parsedChinaUpdatesSeed) throw new Error("bundled China updates seed failed validation");
const bundledChinaUpdatesSeed: UpdatesDocument = parsedChinaUpdatesSeed;

const cachedUpdatesDocuments = new Map<string, UpdatesDocument>([
  [UPDATES_DOCUMENT_URL, bundledUpdatesSeed],
  ["/updates.json", bundledChinaUpdatesSeed],
]);
const activeUpdatesRequests = new Map<string, Promise<UpdatesRequestResult>>();
const lastUpdatesRequestStartedAt = new Map<string, number>();
const lastUpdatesRequestFailed = new Map<string, boolean>();

interface UpdatesRequestResult {
  document: UpdatesDocument;
  failed: boolean;
}

function bundledUpdatesDocument(documentUrl: string) {
  return documentUrl === "/updates.json" ? bundledChinaUpdatesSeed : bundledUpdatesSeed;
}

async function requestUpdatesDocument(documentUrl: string): Promise<UpdatesRequestResult> {
  const activeRequest = activeUpdatesRequests.get(documentUrl);
  if (activeRequest) return activeRequest;
  const now = Date.now();
  const cachedDocument =
    cachedUpdatesDocuments.get(documentUrl) ?? bundledUpdatesDocument(documentUrl);
  const lastStartedAt = lastUpdatesRequestStartedAt.get(documentUrl) ?? 0;
  if (now - lastStartedAt < UPDATES_REFRESH_MS) {
    return {
      document: cachedDocument,
      failed: lastUpdatesRequestFailed.get(documentUrl) ?? false,
    };
  }
  lastUpdatesRequestStartedAt.set(documentUrl, now);

  const request = (async (): Promise<UpdatesRequestResult> => {
    let document = cachedDocument;
    let failed = false;
    try {
      const response = await fetch(documentUrl, {
        cache: "default",
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`updates request failed with HTTP ${response.status}`);
      const parsed = parseUpdatesDocument(await response.json());
      if (!parsed) throw new Error("updates document failed validation");
      document = parsed;
      cachedUpdatesDocuments.set(documentUrl, parsed);
    } catch {
      failed = true;
    }
    lastUpdatesRequestFailed.set(documentUrl, failed);
    return {
      document,
      failed,
    };
  })();
  activeUpdatesRequests.set(documentUrl, request);
  try {
    return await request;
  } finally {
    if (activeUpdatesRequests.get(documentUrl) === request) {
      activeUpdatesRequests.delete(documentUrl);
    }
  }
}

export function useSiteUpdates(documentUrl = UPDATES_DOCUMENT_URL) {
  const [updatesDocument, setUpdatesDocument] = useState<UpdatesDocument>(
    () => cachedUpdatesDocuments.get(documentUrl) ?? bundledUpdatesDocument(documentUrl),
  );
  const [failed, setFailed] = useState(
    () => lastUpdatesRequestFailed.get(documentUrl) ?? false,
  );

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      const result = await requestUpdatesDocument(documentUrl);
      if (!disposed) {
        setUpdatesDocument(result.document);
        setFailed(result.failed);
      }
    };

    void load();
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, UPDATES_REFRESH_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [documentUrl]);

  return {
    document: updatesDocument,
    failed,
    dateLabel: formatSiteUpdatedOn(updatesDocument.siteUpdatedOn),
  };
}

export function SiteFooterUpdatesModal({
  closeButtonRef,
  documents,
  failures,
  initialEdition,
  onClose,
}: {
  closeButtonRef: { current: HTMLButtonElement | null };
  documents: Record<SiteEdition, UpdatesDocument>;
  failures: Record<SiteEdition, boolean>;
  initialEdition: SiteEdition;
  onClose: () => void;
}) {
  const [edition, setEdition] = useState<SiteEdition>(initialEdition);
  const document = documents[edition];
  const failed = failures[edition];

  return (
    <div
      className="site-footer__sponsor-modal site-footer__updates-modal"
      role="dialog"
      aria-modal="true"
      aria-label="网站更新日志"
    >
      <button
        className="site-footer__sponsor-modal-backdrop"
        type="button"
        aria-label="关闭更新日志"
        onClick={onClose}
      />
      <section className="site-footer__sponsor-dialog site-footer__updates-dialog">
        <header>
          <div>
            <small>UPDATE LOG</small>
            <strong>网站更新日志</strong>
          </div>
          <button
            ref={closeButtonRef}
            className="site-footer__sponsor-modal-close"
            type="button"
            aria-label="关闭更新日志"
            onClick={onClose}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <div className="site-footer__updates-edition-tabs" role="tablist" aria-label="选择更新日志版本">
          {([
            ["china", "国服"],
            ["international", "国际版"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`site-footer-updates-tab-${value}`}
              aria-controls={`site-footer-updates-panel-${value}`}
              aria-selected={edition === value}
              data-active={edition === value}
              onClick={() => setEdition(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {failed ? (
          <p className="site-footer__updates-status" role="status">
            最新日志暂时无法读取，当前显示随本站发布的最近版本。
          </p>
        ) : null}
        <ol
          id={`site-footer-updates-panel-${edition}`}
          className="site-footer__updates-list"
          role="tabpanel"
          aria-labelledby={`site-footer-updates-tab-${edition}`}
        >
          {document.entries.map((entry) => (
            <li key={entry.id}>
              <article>
                <header>
                  <time dateTime={entry.date}>{entry.date.replaceAll("-", "/")}</time>
                  <strong>{entry.title}</strong>
                </header>
                <ul>
                  {entry.items.map((item, itemIndex) => (
                    <li key={`${entry.id}-${itemIndex}`}>{item}</li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
