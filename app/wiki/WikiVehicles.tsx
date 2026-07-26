"use client";

import { Search, Waves } from "lucide-react";
import { useMemo, useState } from "react";

import { factionDisplayName } from "../faction-display-name";
import { InternationalHeader } from "../InternationalHeader";
import { runtimeCardImpressionForVariant } from "../runtime-probe-card-impressions";
import {
  wikiVehicleEntries,
  wikiVehicleSummary,
  type WikiVehicleEntry,
} from "../wiki-vehicles";

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s_./-]+/g, "");
}

function uniqueVehicles() {
  return [...new Map(wikiVehicleEntries.map((entry) => [`${entry.cardId}\u0000${entry.rawName}`, entry])).values()];
}

function WikiVehicleCard({ vehicle }: { vehicle: WikiVehicleEntry }) {
  const impression = runtimeCardImpressionForVariant(vehicle.cardId, vehicle.rawName);
  return (
    <article className="sigua-wiki-vehicle-card">
      <div className="sigua-wiki-vehicle-card__image">
        {impression ? <img src={impression.path} width={impression.width} height={impression.height} alt="" aria-hidden="true" loading="lazy" decoding="async" /> : null}
        <span className="sigua-wiki-vehicle-card__icon">{vehicle.icon}</span>
      </div>
      <div className="sigua-wiki-vehicle-card__body">
        <div className="sigua-wiki-vehicle-card__topline">
          <span>{vehicle.type}</span>
        </div>
        <strong className="sigua-wiki-vehicle-card__name">{vehicle.displayName}</strong>
        <code className="sigua-wiki-vehicle-card__raw-name">{vehicle.rawName}</code>
        <div className="sigua-wiki-vehicle-card__chips">
          {vehicle.factions.slice(0, 4).map((faction) => <span key={faction}>{factionDisplayName(faction)}</span>)}
          {vehicle.amphibious ? <Waves size={12} aria-label="Amphibious" /> : null}
        </div>
      </div>
    </article>
  );
}

export function WikiVehicles() {
  const [query, setQuery] = useState("");
  const [faction, setFaction] = useState("all");
  const [type, setType] = useState("all");
  const vehicles = useMemo(() => uniqueVehicles(), []);
  const factionOptions = useMemo(() => [...new Set(vehicles.flatMap((vehicle) => vehicle.factions))].sort(), [vehicles]);
  const typeOptions = useMemo(() => [...new Set(vehicles.map((vehicle) => vehicle.type))].sort(), [vehicles]);
  const filtered = useMemo(() => {
    const needle = normalized(query);
    return vehicles.filter((vehicle) => {
      const matchesQuery = !needle || normalized([
        vehicle.displayName,
        vehicle.rawName,
        vehicle.type,
        ...vehicle.vehicleTags,
        ...vehicle.factions,
        ...vehicle.factions.map((faction) => factionDisplayName(faction)),
      ].join(" ")).includes(needle);
      const matchesFaction = faction === "all" || vehicle.factions.includes(faction);
      const matchesType = type === "all" || vehicle.type === type;
      return matchesQuery && matchesFaction && matchesType;
    });
  }, [faction, query, type, vehicles]);

  return (
    <div className="sigua-wiki-replica">
      <InternationalHeader />
      <main className="sigua-wiki-wiki-main sigua-wiki-wiki-main--vehicles">
        <div className="sigua-wiki-page-wrap sigua-wiki-page-wrap--vehicles">
          <header className="sigua-wiki-page-heading sigua-wiki-page-heading--vehicles">
            <div className="sigua-wiki-vehicle-heading">
              <div>
                <div className="sigua-wiki-page-heading__kicker">INTERNATIONAL / WIKI</div>
                <div className="sigua-wiki-page-heading__title-row">
                  <span aria-hidden="true" />
                  <h1>Wiki - Vehicles</h1>
                </div>
                <p>Source vehicle metadata applied to the international catalog.</p>
              </div>
              <div className="sigua-wiki-vehicle-summary">
                <strong>{vehicles.length}</strong>
                <span>CATALOG VARIANTS</span>
              </div>
            </div>
          </header>
          <div className="sigua-wiki-source-strip">
            <div>
              <strong>LOCAL VEHICLE INDEX</strong>
              <span>Local metadata snapshot</span>
            </div>
            <code>SIGUA PUBLIC</code>
          </div>
          <section className="sigua-wiki-vehicle-toolbar" aria-label="Wiki vehicle filters">
            <label className="sigua-wiki-search">
              <Search size={14} aria-hidden="true" />
              <span className="sigua-wiki-visually-hidden">Search Wiki vehicles</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Wiki vehicles..." />
            </label>
            <label className="sigua-wiki-vehicle-select">
              <span className="sigua-wiki-visually-hidden">Filter by faction</span>
              <select value={faction} onChange={(event) => setFaction(event.target.value)}>
                <option value="all">All Factions</option>
                {factionOptions.map((id) => <option key={id} value={id}>{id} · {factionDisplayName(id)}</option>)}
              </select>
            </label>
            <label className="sigua-wiki-vehicle-select">
              <span className="sigua-wiki-visually-hidden">Filter by type</span>
              <select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="all">All Types</option>
                {typeOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <span className="sigua-wiki-result-count">{filtered.length} catalog variants</span>
          </section>
          {filtered.length > 0 ? (
            <div className="sigua-wiki-vehicle-grid">
              {filtered.map((vehicle) => <WikiVehicleCard key={`${vehicle.cardId}-${vehicle.rawName}`} vehicle={vehicle} />)}
            </div>
          ) : (
            <p className="sigua-wiki-empty-state">No vehicles found.</p>
          )}
        </div>
      </main>
      <footer className="sigua-wiki-footer">
        <span>WIKI DATA · {wikiVehicleSummary.sourceVehicles} source vehicles</span>
        <span>LOCAL SNAPSHOT · {wikiVehicleEntries.length} catalog variants</span>
      </footer>
    </div>
  );
}
