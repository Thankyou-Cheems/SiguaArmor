"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface DailyActiveSnapshot {
  schemaVersion: "sigua-public-dau/v1";
  date: string;
  dau: number;
}

type DailyActiveDisplayVariant = "hero" | "dock" | "dock-mobile" | "nav";

const DailyActiveContext = createContext<DailyActiveSnapshot | null>(null);
const DAILY_ACTIVE_SCHEMA = "sigua-public-dau/v1";
const DAILY_ACTIVE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function parseDailyActiveSnapshot(value: unknown): DailyActiveSnapshot | null {
  if (
    !value
    || typeof value !== "object"
    || (value as { schemaVersion?: unknown }).schemaVersion !== DAILY_ACTIVE_SCHEMA
    || typeof (value as { date?: unknown }).date !== "string"
    || !DAILY_ACTIVE_DATE_PATTERN.test((value as { date: string }).date)
    || !Number.isSafeInteger((value as { dau?: unknown }).dau)
    || (value as { dau: number }).dau < 0
  ) {
    return null;
  }
  return value as DailyActiveSnapshot;
}

function readSessionSnapshot(key: string) {
  try {
    const stored = window.sessionStorage.getItem(key);
    return stored ? parseDailyActiveSnapshot(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function writeSessionSnapshot(key: string, snapshot: DailyActiveSnapshot) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Aggregate display caching is optional.
  }
}

export function DailyActiveProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<DailyActiveSnapshot | null>(null);

  useEffect(() => {
    const day = new Date().toISOString().slice(0, 10);
    const sessionKey = `sigua-dau:${day}`;
    const snapshotKey = `sigua-dau-snapshot:${day}`;
    const cachedSnapshot = readSessionSnapshot(snapshotKey);
    if (cachedSnapshot) setSnapshot(cachedSnapshot);

    let alreadyRecorded = false;
    try {
      alreadyRecorded = window.sessionStorage.getItem(sessionKey) === "recorded";
    } catch {
      // The origin deduplicates by UTC day and IP when storage is unavailable.
    }

    let mounted = true;
    const method = alreadyRecorded ? "GET" : "POST";
    void fetch("/__analytics/dau", {
      method,
      cache: "no-store",
      credentials: "omit",
      keepalive: method === "POST",
      mode: "same-origin",
    })
      .then(async (response) => {
        if (!mounted || !response.ok) return;
        if (method === "POST") {
          try {
            window.sessionStorage.setItem(sessionKey, "recorded");
          } catch {
            // Storage only suppresses duplicate same-tab beacons.
          }
        }
        const nextSnapshot = parseDailyActiveSnapshot(await response.json());
        if (!mounted || !nextSnapshot) return;
        writeSessionSnapshot(snapshotKey, nextSnapshot);
        setSnapshot(nextSnapshot);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <DailyActiveContext.Provider value={snapshot}>
      {children}
    </DailyActiveContext.Provider>
  );
}

export function DailyActiveDisplay({
  variant,
}: {
  variant: DailyActiveDisplayVariant;
}) {
  const snapshot = useContext(DailyActiveContext);
  const formattedDau = useMemo(
    () => snapshot ? new Intl.NumberFormat("zh-CN").format(snapshot.dau) : "",
    [snapshot],
  );
  if (!snapshot) return null;

  return (
    <span
      className={`daily-active-display daily-active-display--${variant}`}
      role="status"
      aria-label={`今日活跃 ${formattedDau} 人`}
      title={`${snapshot.date}（UTC）独立访客`}
    >
      <i aria-hidden="true" />
      <span>今日活跃</span>
      <strong>{formattedDau}</strong>
    </span>
  );
}
