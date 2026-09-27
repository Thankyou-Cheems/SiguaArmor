"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Activity, Database, ShieldCheck } from "lucide-react";

export interface AdminAnalyticsDay {
  version: 2;
  date: string;
  dau: number;
}

export interface AdminAnalyticsOverview {
  schemaVersion: "sigua-admin-dau-overview/v2";
  generatedAt: string;
  days: AdminAnalyticsDay[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function parseAdminAnalyticsOverview(value: unknown): AdminAnalyticsOverview | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (
    source.schemaVersion !== "sigua-admin-dau-overview/v2"
    || typeof source.generatedAt !== "string"
    || !Number.isFinite(Date.parse(source.generatedAt))
    || !Array.isArray(source.days)
    || source.days.length > 3660
  ) {
    return null;
  }
  const days: AdminAnalyticsDay[] = [];
  let previousDate = "";
  for (const rawDay of source.days) {
    if (!rawDay || typeof rawDay !== "object") return null;
    const day = rawDay as Record<string, unknown>;
    if (
      day.version !== 2
      || typeof day.date !== "string"
      || !DATE_PATTERN.test(day.date)
      || day.date <= previousDate
      || !Number.isSafeInteger(day.dau)
      || Number(day.dau) < 0
    ) {
      return null;
    }
    days.push({ version: 2, date: day.date, dau: Number(day.dau) });
    previousDate = day.date;
  }
  return {
    schemaVersion: "sigua-admin-dau-overview/v2",
    generatedAt: source.generatedAt,
    days,
  };
}

function average(values: readonly number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function AdminAnalyticsDashboard({
  overview,
}: {
  overview: AdminAnalyticsOverview;
}) {
  const days = overview.days;
  const latestDate = days.at(-1)?.date ?? "";
  const [selectedDate, setSelectedDate] = useState(latestDate);
  useEffect(() => {
    if (!days.some((day) => day.date === selectedDate)) setSelectedDate(latestDate);
  }, [days, latestDate, selectedDate]);

  const selectedDay = days.find((day) => day.date === selectedDate) ?? days.at(-1) ?? null;
  const latestDay = days.at(-1) ?? null;
  const today = new Date(overview.generatedAt);
  const todayDate = today.toISOString().slice(0, 10);
  const dailyCounts = new Map(days.map((day) => [day.date, day.dau]));
  const recentSeven = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - 6 + index);
    return dailyCounts.get(date.toISOString().slice(0, 10)) ?? 0;
  });
  const peakDay = days.reduce<AdminAnalyticsDay | null>(
    (peak, day) => !peak || day.dau > peak.dau ? day : peak,
    null,
  );
  const totalDau = days.reduce((sum, day) => sum + day.dau, 0);
  const maximumDau = Math.max(1, ...days.map((day) => day.dau));

  return (
    <section className="admin-analytics" aria-label="全部日活数据总览">
      <header className="admin-analytics__heading">
        <div>
          <small>DAILY ACTIVE OVERVIEW</small>
          <strong>IP 去重日活</strong>
          <p>按 UTC 日期对访问 IP 去重，仅展示每日人数。</p>
        </div>
        <span>
          <i />
          更新于 {new Date(overview.generatedAt).toLocaleString("zh-CN", { hour12: false })}
        </span>
      </header>

      <div className="admin-analytics__kpis">
        <article>
          <Activity size={15} aria-hidden="true" />
          <span>今日 DAU</span>
          <strong>{dailyCounts.get(todayDate) ?? 0}</strong>
          <small>{shortDate(todayDate)}</small>
        </article>
        <article>
          <Database size={15} aria-hidden="true" />
          <span>近 7 日均值</span>
          <strong>{average(recentSeven).toFixed(1)}</strong>
          <small>最近 7 个自然日</small>
        </article>
        <article>
          <Activity size={15} aria-hidden="true" />
          <span>历史峰值</span>
          <strong>{peakDay?.dau ?? 0}</strong>
          <small>{peakDay ? shortDate(peakDay.date) : "暂无记录"}</small>
        </article>
        <article>
          <Database size={15} aria-hidden="true" />
          <span>累计日活人次</span>
          <strong>{totalDau}</strong>
          <small>{days.length} 个记录日</small>
        </article>
      </div>

      <section className="admin-analytics__panel admin-analytics__trend">
        <header>
          <div><small>TREND</small><strong>全部 DAU 趋势</strong></div>
          <span>{days[0]?.date ?? "—"} → {latestDay?.date ?? "—"}</span>
        </header>
        {days.length === 0 ? (
          <p className="admin-analytics__empty">暂无日活数据</p>
        ) : (
          <div className="admin-analytics__trend-scroll">
            <div
              className="admin-analytics__bars"
              style={{ "--analytics-days": days.length } as CSSProperties}
            >
              {days.map((day, index) => (
                <button
                  key={day.date}
                  type="button"
                  data-selected={selectedDay?.date === day.date}
                  style={{ "--analytics-bar": `${Math.max(2, day.dau / maximumDau * 100)}%` } as CSSProperties}
                  title={`${day.date} · DAU ${day.dau}`}
                  aria-label={`查看 ${day.date} 的 DAU，${day.dau} 人`}
                  onClick={() => setSelectedDate(day.date)}
                >
                  <i><b /></i>
                  <strong>{day.dau}</strong>
                  <small>{index === 0 || index === days.length - 1 || index % 7 === 0 ? shortDate(day.date) : ""}</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {selectedDay ? (
        <section className="admin-analytics__panel admin-analytics__selected-day">
          <header><div><small>DAY</small><strong>所选日期</strong></div></header>
          <div className="admin-analytics__day-summary">
            <span>{selectedDay.date}</span>
            <b>DAU {selectedDay.dau}</b>
            <small>按 IP 去重</small>
          </div>
        </section>
      ) : null}

      <footer className="admin-analytics__privacy">
        <ShieldCheck size={16} aria-hidden="true" />
        <p>
          <strong>隐私保护</strong>
          <span>原始 IP 不下发；IP 在服务器上加密保存不超过 30 天，到期后只保留每日人数。新记录不再采集城市或地区信息。</span>
        </p>
      </footer>
    </section>
  );
}
