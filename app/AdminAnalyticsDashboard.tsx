"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Activity, Database, Globe2, MapPinned, ShieldCheck } from "lucide-react";

export interface AdminAnalyticsCity {
  countryCode: string;
  subdivision: string | null;
  city: string;
  dau: number;
}

export interface AdminAnalyticsDay {
  version: 1;
  date: string;
  dau: number;
  cityThreshold: number;
  cities: AdminAnalyticsCity[];
  otherDau: number;
  cityStatus: "live_thresholded" | "raw_thresholded" | "archived";
}

export interface AdminAnalyticsOverview {
  schemaVersion: "sigua-admin-dau-overview/v1";
  generatedAt: string;
  geoIpDatabaseRelease: string;
  cityThreshold: number;
  days: AdminAnalyticsDay[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const CITY_STATUSES = new Set([
  "live_thresholded",
  "raw_thresholded",
  "archived",
]);

export function parseAdminAnalyticsOverview(value: unknown): AdminAnalyticsOverview | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (
    source.schemaVersion !== "sigua-admin-dau-overview/v1" ||
    typeof source.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(source.generatedAt)) ||
    typeof source.geoIpDatabaseRelease !== "string" ||
    !/^\d{4}-\d{2}$/u.test(source.geoIpDatabaseRelease) ||
    !Number.isSafeInteger(source.cityThreshold) ||
    Number(source.cityThreshold) < 3 ||
    !Array.isArray(source.days) ||
    source.days.length > 3660
  ) {
    return null;
  }
  const days: AdminAnalyticsDay[] = [];
  let previousDate = "";
  for (const rawDay of source.days) {
    if (!rawDay || typeof rawDay !== "object") return null;
    const day = rawDay as Record<string, unknown>;
    if (
      day.version !== 1 ||
      typeof day.date !== "string" ||
      !DATE_PATTERN.test(day.date) ||
      day.date <= previousDate ||
      !Number.isSafeInteger(day.dau) ||
      Number(day.dau) < 0 ||
      day.cityThreshold !== source.cityThreshold ||
      !Number.isSafeInteger(day.otherDau) ||
      Number(day.otherDau) < 0 ||
      typeof day.cityStatus !== "string" ||
      !CITY_STATUSES.has(day.cityStatus) ||
      !Array.isArray(day.cities)
    ) {
      return null;
    }
    const cities: AdminAnalyticsCity[] = [];
    let total = Number(day.otherDau);
    for (const rawCity of day.cities) {
      if (!rawCity || typeof rawCity !== "object") return null;
      const city = rawCity as Record<string, unknown>;
      if (
        typeof city.countryCode !== "string" ||
        !/^[A-Z]{2}$/u.test(city.countryCode) ||
        !(city.subdivision === null || typeof city.subdivision === "string") ||
        typeof city.city !== "string" ||
        city.city.length === 0 ||
        !Number.isSafeInteger(city.dau) ||
        Number(city.dau) < Number(source.cityThreshold)
      ) {
        return null;
      }
      total += Number(city.dau);
      cities.push({
        countryCode: city.countryCode,
        subdivision: city.subdivision as string | null,
        city: city.city,
        dau: Number(city.dau),
      });
    }
    if (total !== Number(day.dau)) return null;
    days.push({
      version: 1,
      date: day.date,
      dau: Number(day.dau),
      cityThreshold: Number(day.cityThreshold),
      cities,
      otherDau: Number(day.otherDau),
      cityStatus: day.cityStatus as AdminAnalyticsDay["cityStatus"],
    });
    previousDate = day.date;
  }
  return {
    schemaVersion: "sigua-admin-dau-overview/v1",
    generatedAt: source.generatedAt,
    geoIpDatabaseRelease: source.geoIpDatabaseRelease,
    cityThreshold: Number(source.cityThreshold),
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

function countryName(countryCode: string) {
  try {
    return new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}

function statusLabel(status: AdminAnalyticsDay["cityStatus"]) {
  if (status === "live_thresholded") return "实时未闭账";
  if (status === "raw_thresholded") return "原始日聚合";
  return "历史归档";
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
  const recentSeven = days.slice(-7);
  const peakDay = days.reduce<AdminAnalyticsDay | null>(
    (peak, day) => !peak || day.dau > peak.dau ? day : peak,
    null,
  );
  const totalDau = days.reduce((sum, day) => sum + day.dau, 0);
  const visibleRegionDau = days.reduce(
    (sum, day) => sum + day.cities.reduce((citySum, city) => citySum + city.dau, 0),
    0,
  );
  const visibleRegionRate = totalDau === 0 ? 0 : visibleRegionDau / totalDau;
  const maximumDau = Math.max(1, ...days.map((day) => day.dau));
  const countryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const day of days) {
      for (const city of day.cities) {
        totals.set(city.countryCode, (totals.get(city.countryCode) ?? 0) + city.dau);
      }
    }
    return [...totals.entries()]
      .map(([countryCode, dau]) => ({ countryCode, dau }))
      .sort((left, right) => right.dau - left.dau || left.countryCode.localeCompare(right.countryCode));
  }, [days]);
  const maximumCountryDau = Math.max(1, ...countryTotals.map(({ dau }) => dau));

  return (
    <section className="admin-analytics" aria-label="全部日活数据总览">
      <header className="admin-analytics__heading">
        <div>
          <small>DAILY ACTIVE OVERVIEW</small>
          <strong>日活与 IP 地区总览</strong>
          <p>覆盖系统现存的实时明细与全部历史聚合归档。</p>
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
          <strong>{latestDay?.dau ?? 0}</strong>
          <small>{latestDay ? shortDate(latestDay.date) : "暂无记录"}</small>
        </article>
        <article>
          <Database size={15} aria-hidden="true" />
          <span>近 7 日均值</span>
          <strong>{average(recentSeven.map((day) => day.dau)).toFixed(1)}</strong>
          <small>{recentSeven.length} 个记录日</small>
        </article>
        <article>
          <Activity size={15} aria-hidden="true" />
          <span>历史峰值</span>
          <strong>{peakDay?.dau ?? 0}</strong>
          <small>{peakDay ? shortDate(peakDay.date) : "暂无记录"}</small>
        </article>
        <article>
          <Globe2 size={15} aria-hidden="true" />
          <span>累计活跃人次</span>
          <strong>{totalDau}</strong>
          <small>{days.length} 个记录日</small>
        </article>
        <article>
          <MapPinned size={15} aria-hidden="true" />
          <span>地区可见率</span>
          <strong>{(visibleRegionRate * 100).toFixed(1)}%</strong>
          <small>达到披露阈值的 DAU</small>
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
                  aria-label={`查看 ${day.date} 的地区明细，DAU ${day.dau}`}
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

      <div className="admin-analytics__split">
        <section className="admin-analytics__panel admin-analytics__countries">
          <header><div><small>MIX</small><strong>国家 / 地区累计分布</strong></div></header>
          <div>
            {countryTotals.slice(0, 10).map(({ countryCode, dau }) => (
              <article key={countryCode}>
                <span><b>{countryName(countryCode)}</b><small>{countryCode}</small></span>
                <i><b style={{ width: `${dau / maximumCountryDau * 100}%` }} /></i>
                <strong>{dau}</strong>
              </article>
            ))}
            {countryTotals.length === 0 ? <p className="admin-analytics__empty">暂无达到披露阈值的地区</p> : null}
          </div>
        </section>

        <section className="admin-analytics__panel admin-analytics__cities">
          <header>
            <div><small>DETAIL</small><strong>单日城市明细</strong></div>
            <select
              aria-label="选择地区明细日期"
              value={selectedDay?.date ?? ""}
              onChange={(event) => setSelectedDate(event.currentTarget.value)}
            >
              {days.map((day) => <option key={day.date} value={day.date}>{day.date} · {day.dau}</option>)}
            </select>
          </header>
          {selectedDay ? (
            <>
              <div className="admin-analytics__day-summary">
                <span>{statusLabel(selectedDay.cityStatus)}</span>
                <b>DAU {selectedDay.dau}</b>
                <small>其他 / 低样本 {selectedDay.otherDau}</small>
              </div>
              <div className="admin-analytics__city-table" role="table" aria-label={`${selectedDay.date} 地区明细`}>
                <div role="row"><b role="columnheader">国家</b><b role="columnheader">省/州 · 城市</b><b role="columnheader">DAU</b></div>
                {selectedDay.cities.map((city) => (
                  <div role="row" key={`${city.countryCode}:${city.subdivision}:${city.city}`}>
                    <span role="cell">{countryName(city.countryCode)}</span>
                    <span role="cell">{city.subdivision ? `${city.subdivision} · ` : ""}{city.city}</span>
                    <strong role="cell">{city.dau}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="admin-analytics__empty">暂无地区明细</p>}
        </section>
      </div>

      <footer className="admin-analytics__privacy">
        <ShieldCheck size={16} aria-hidden="true" />
        <p>
          <strong>隐私保护</strong>
          <span>原始 IP 不下发；IP 仅加密保存不超过 30 天。超过 30 天的数据继续以阈值化地区聚合归档参与统计。单个地区低于 {overview.cityThreshold} DAU 时合并到“其他”。</span>
        </p>
        <small>GeoIP 数据库 {overview.geoIpDatabaseRelease}</small>
      </footer>
    </section>
  );
}
