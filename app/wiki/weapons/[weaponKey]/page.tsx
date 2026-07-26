import { notFound } from "next/navigation";

import { factionDisplayName } from "../../../faction-display-name";
import { internationalPath } from "../../../site-paths";
import {
  factionLabels,
  wikiWeaponConfigurationByKey,
  wikiWeaponDamageCurves,
  wikiWeapons,
  type WikiJsonObject,
  type WikiJsonValue,
  type WikiWeaponConfiguration,
} from "../../wiki-data";
import { WikiHeader } from "../../WikiHeader";

import styles from "./WeaponDetails.module.css";

interface RawRow {
  path: string;
  value: string;
}

function asObject(value: WikiJsonValue | undefined): WikiJsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function numberValue(record: WikiJsonObject | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

function stringValue(record: WikiJsonObject | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function booleanValue(record: WikiJsonObject | null, key: string): boolean | null {
  const value = record?.[key];
  return typeof value === "boolean" ? value : null;
}

function formatNumber(value: number, maximumFractionDigits = 3) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function formatBoolean(value: boolean | null) {
  return value === null ? "Unknown" : value ? "Yes" : "No";
}

function rawValue(value: WikiJsonValue) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value || '""';
  return JSON.stringify(value);
}

function flattenRawRows(value: WikiJsonValue, prefix = ""): RawRow[] {
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== "object")) {
      return [{ path: prefix, value: rawValue(value) }];
    }
    return value.flatMap((item, index) => flattenRawRows(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return [{ path: prefix, value: "{}" }];
    return entries.flatMap(([key, item]) =>
      flattenRawRows(item, prefix ? `${prefix} › ${key}` : key));
  }
  return [{ path: prefix, value: rawValue(value) }];
}

function RawDataSection({ title, value }: { title: string; value: WikiJsonValue }) {
  const rows = flattenRawRows(value);
  return (
    <section className={styles.rawSection}>
      <h3>{title}</h3>
      <div className={styles.rawTable} role="table" aria-label={`${title} raw values`}>
        {rows.map((row, index) => (
          <div className={styles.rawRow} role="row" key={`${row.path}-${index}`}>
            <code role="cell">{row.path || "value"}</code>
            <span role="cell">{row.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function configurationFactions(configuration: WikiWeaponConfiguration) {
  return configuration.factions.map((code) => factionLabels[code] ?? factionDisplayName(code));
}

export default async function WeaponDetailPage({
  params,
}: {
  params: Promise<{ weaponKey: string }>;
}) {
  const { weaponKey } = await params;
  const decodedKey = decodeURIComponent(weaponKey);
  const configuration = wikiWeaponConfigurationByKey[decodedKey];
  const weapon = wikiWeapons.find(({ weaponKeys }) => weaponKeys?.includes(decodedKey));
  if (!weapon || !configuration) notFound();

  const factions = configurationFactions(configuration);
  const inventoryInfo = asObject(configuration.inventoryInfo);
  const physicalInfo = asObject(configuration.physicalInfo);
  const weaponInfo = asObject(configuration.weaponInfo);
  const staticInfo = asObject(configuration.staticInfo);
  const restrictions = asObject(staticInfo?.restrictions);
  const projectileInfo = asObject(weaponInfo?.projectileInfo);
  const description = stringValue(inventoryInfo, "description");
  const timeBetweenShots = numberValue(weaponInfo, "timeBetweenShots");
  const roundsPerMinute = timeBetweenShots && timeBetweenShots > 0 ? Math.round(60 / timeBetweenShots) : null;
  const muzzleVelocity = numberValue(weaponInfo, "muzzleVelocity");
  const damageCurveName = stringValue(weaponInfo, "damageFallOffType");
  const damageCurve = damageCurveName ? wikiWeaponDamageCurves[damageCurveName] : undefined;

  const mainStats = [
    ["Damage Type", stringValue(projectileInfo, "damageType") ?? "Unknown"],
    ["Muzzle Velocity", muzzleVelocity === null ? "Unknown" : `${formatNumber(muzzleVelocity / 100, 2)} m/s`],
    ["Armor Penetration", numberValue(weaponInfo, "armorPenMM") === null
      ? "Unknown"
      : `${formatNumber(numberValue(weaponInfo, "armorPenMM") ?? 0)} mm`],
    ["Post-Pen Distance", numberValue(weaponInfo, "traceDistanceAfterPen") === null
      ? "Unknown"
      : `${formatNumber(numberValue(weaponInfo, "traceDistanceAfterPen") ?? 0)} m`],
    ["MOA", numberValue(weaponInfo, "moa") === null ? "Unknown" : formatNumber(numberValue(weaponInfo, "moa") ?? 0)],
    ["Max Range", numberValue(weaponInfo, "maxTraceDistance") === null
      ? "Unknown"
      : `${formatNumber(numberValue(weaponInfo, "maxTraceDistance") ?? 0)} m`],
    ["Rate of Fire", roundsPerMinute === null ? "Unknown" : `${roundsPerMinute} RPM`],
    ["Time Between Shots", timeBetweenShots === null ? "Unknown" : `${formatNumber(timeBetweenShots)} s`],
    ["Tactical Reload", numberValue(weaponInfo, "tacticalReloadDuration") === null
      ? "Unknown"
      : `${formatNumber(numberValue(weaponInfo, "tacticalReloadDuration") ?? 0)} s`],
    ["Dry Reload", numberValue(weaponInfo, "dryReloadDuration") === null
      ? "Unknown"
      : `${formatNumber(numberValue(weaponInfo, "dryReloadDuration") ?? 0)} s`],
    ["Equip Time", numberValue(weaponInfo, "equipDuration") === null
      ? "Unknown"
      : `${formatNumber(numberValue(weaponInfo, "equipDuration") ?? 0)} s`],
    ["Unequip Time", numberValue(weaponInfo, "unEquipDuration") === null
      ? "Unknown"
      : `${formatNumber(numberValue(weaponInfo, "unEquipDuration") ?? 0)} s`],
    ["Magazines", numberValue(weaponInfo, "numberOfMags") === null
      ? "Unknown"
      : formatNumber(numberValue(weaponInfo, "numberOfMags") ?? 0)],
    ["Magazine Size", numberValue(weaponInfo, "magSize") === null
      ? "Unknown"
      : formatNumber(numberValue(weaponInfo, "magSize") ?? 0)],
    ["Standing ADS", numberValue(staticInfo, "standingADSTime") === null
      ? "Unknown"
      : `${formatNumber(numberValue(staticInfo, "standingADSTime") ?? 0)} s`],
    ["Crouching ADS", numberValue(staticInfo, "crouchADSTime") === null
      ? "Unknown"
      : `${formatNumber(numberValue(staticInfo, "crouchADSTime") ?? 0)} s`],
    ["Prone ADS", numberValue(staticInfo, "proneADSTime") === null
      ? "Unknown"
      : `${formatNumber(numberValue(staticInfo, "proneADSTime") ?? 0)} s`],
    ["Bipod ADS", numberValue(staticInfo, "bipodADSTime") === null
      ? "Unknown"
      : `${formatNumber(numberValue(staticInfo, "bipodADSTime") ?? 0)} s`],
    ["Applies Suppression", formatBoolean(booleanValue(projectileInfo, "appliesSuppression"))],
    ["Tracer Frequency", numberValue(weaponInfo, "roundsBetweenTracer") === null
      ? "Unknown"
      : `1:${formatNumber(numberValue(weaponInfo, "roundsBetweenTracer") ?? 0)}`],
  ].filter(([, value]) => value !== "Unknown");

  const rawSections = Object.entries(configuration)
    .filter(([key]) => !["displayName", "factions", "weaponKey"].includes(key));

  return (
    <div className="sigua-wiki-replica">
      <WikiHeader />
      <main className="sigua-wiki-detail-main sigua-wiki-detail-main--weapon">
        <a className="sigua-wiki-back-link" href={internationalPath("/wiki/weapons")}>← Weapons</a>
        <section className="sigua-wiki-weapon-detail">
          <div className="sigua-wiki-weapon-detail__image">
            <img src={weapon.imagePath} alt={configuration.displayName} />
          </div>
          <div className="sigua-wiki-weapon-detail__content">
            <div className="sigua-wiki-detail-kicker">{weapon.type}</div>
            <h1>{configuration.displayName}</h1>
            <div className="sigua-wiki-detail-tags">
              {factions.length > 0 ? factions.map((faction) => <span key={faction}>{faction}</span>) : <span>Unknown</span>}
            </div>
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
        </section>

        <section className="sigua-wiki-detail-panel">
          <div className={styles.panelHeading}>
            <h2>Configurations</h2>
            <span>{weapon.weaponKeys?.length ?? 0} total</span>
          </div>
          <div className="sigua-wiki-config-table" role="table" aria-label="Weapon configurations">
            <div role="row" className="sigua-wiki-config-table__row sigua-wiki-config-table__row--header">
              <span role="columnheader">Configuration</span>
              <span role="columnheader">Full Name</span>
              <span role="columnheader">Factions</span>
            </div>
            {(weapon.weaponKeys ?? []).map((key) => {
              const item = wikiWeaponConfigurationByKey[key];
              if (!item) return null;
              const itemFactions = configurationFactions(item);
              return (
                <div
                  role="row"
                  className={`${styles.configurationRow} ${key === decodedKey ? styles.configurationRowActive : ""}`}
                  key={key}
                >
                  <span role="cell">
                    <a href={internationalPath(`/wiki/weapons/${encodeURIComponent(key)}`)}>{key}</a>
                  </span>
                  <span role="cell">{item.displayName}</span>
                  <span role="cell">{itemFactions.join(", ") || "Unknown"}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="sigua-wiki-detail-panel sigua-wiki-detail-panel--stats">
          <div className={styles.panelHeading}>
            <h2>Weapon Statistics</h2>
            <span>{decodedKey}</span>
          </div>
          <div className={`sigua-wiki-stat-grid ${styles.statGrid}`}>
            {mainStats.map(([label, value]) => <StatCell key={label} label={label} value={value} />)}
          </div>
          {damageCurveName ? (
            <div className={styles.curveSummary}>
              <span>Damage Curve</span>
              <strong>{damageCurveName}</strong>
              {Array.isArray(damageCurve) ? <code>{damageCurve.join(" · ")}</code> : null}
            </div>
          ) : null}
        </section>

        <details className={styles.nerds}>
          <summary>
            <span>Stats for Nerds</span>
            <small>Complete raw configuration</small>
          </summary>
          <div className={styles.rawSections}>
            {rawSections.map(([key, value]) => <RawDataSection key={key} title={key} value={value} />)}
            {damageCurveName && damageCurve !== undefined ? (
              <RawDataSection title={`damageCurves › ${damageCurveName}`} value={damageCurve} />
            ) : null}
          </div>
        </details>

        <section className="sigua-wiki-detail-panel">
          <h2>Technical Details</h2>
          <div className={`sigua-wiki-stat-grid ${styles.statGrid}`}>
            <StatCell label="Internal Key" value={decodedKey} />
            <StatCell label="Type" value={weapon.type} />
            <StatCell label="Has Bipod" value={formatBoolean(booleanValue(staticInfo, "hasBipod"))} />
            <StatCell label="Adjustable Sight" value={formatBoolean(booleanValue(staticInfo, "hasAdjustableSight"))} />
            <StatCell label="Round in Chamber" value={formatBoolean(booleanValue(weaponInfo, "allowRoundInChamber"))} />
            <StatCell label="Single Load" value={formatBoolean(booleanValue(weaponInfo, "allowSingleLoad"))} />
            <StatCell
              label="Walk Speed Mult"
              value={numberValue(restrictions, "walkSpeedMultiplier") === null
                ? "Unknown"
                : formatNumber(numberValue(restrictions, "walkSpeedMultiplier") ?? 0)}
            />
            <StatCell label="Requires ADS" value={formatBoolean(booleanValue(restrictions, "requireADSToShoot"))} />
            <StatCell
              label="No Shoot While Crawl"
              value={formatBoolean(booleanValue(restrictions, "preventShootUseWhileCrawl"))}
            />
            <StatCell
              label="Skeletal Mesh"
              value={stringValue(physicalInfo, "skeletalMesh") ?? "Unknown"}
            />
            <StatCell
              label="Ammo Per Rearm"
              value={numberValue(inventoryInfo, "ammoPerRearm") === null
                ? "Unknown"
                : formatNumber(numberValue(inventoryInfo, "ammoPerRearm") ?? 0)}
            />
            <StatCell label="Data Fields" value={String(flattenRawRows(configuration).length)} />
          </div>
        </section>
      </main>
    </div>
  );
}
