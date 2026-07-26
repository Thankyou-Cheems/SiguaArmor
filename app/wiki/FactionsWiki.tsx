"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { factionDisplayName } from "../faction-display-name";
import { internationalPath } from "../site-paths";
import { wikiFactions, type WikiFaction } from "./wiki-data";

function FactionCard({ faction }: { faction: WikiFaction }) {
  const displayName = factionDisplayName(faction.code);
  return (
    <a
      className="sigua-wiki-faction-card"
      href={internationalPath(`/wiki/factions/${encodeURIComponent(faction.code)}`)}
    >
      <div className="sigua-wiki-faction-card__image">
        <img src={faction.imagePath} alt={displayName} loading="lazy" />
      </div>
      <div className="sigua-wiki-faction-card__body">
        <div className="sigua-wiki-faction-card__name">{displayName}</div>
        <div className="sigua-wiki-faction-card__meta">
          <span>{faction.code}</span>
          <span>{faction.setupCount} setups</span>
        </div>
      </div>
    </a>
  );
}

export function FactionsWiki() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return wikiFactions;
    return wikiFactions.filter(({ code, name }) =>
      `${code} ${name} ${factionDisplayName(code)}`.toLocaleLowerCase().includes(needle),
    );
  }, [query]);

  return (
    <main className="sigua-wiki-wiki-main sigua-wiki-wiki-main--factions">
      <div className="sigua-wiki-page-wrap sigua-wiki-page-wrap--factions">
        <div className="sigua-wiki-page-heading sigua-wiki-page-heading--factions">
          <div className="sigua-wiki-page-heading__title-row">
            <span aria-hidden="true" />
            <h1>Wiki - Factions</h1>
          </div>
          <p>All playable factions in Squad</p>
        </div>
        <div className="sigua-wiki-faction-toolbar">
          <label className="sigua-wiki-search">
            <Search size={13} aria-hidden="true" />
            <span className="sigua-wiki-visually-hidden">Search factions</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search factions..."
            />
          </label>
          <span className="sigua-wiki-result-count">{filtered.length} factions</span>
        </div>
        {filtered.length > 0 ? (
          <div className="sigua-wiki-faction-grid">
            {filtered.map((faction) => <FactionCard key={faction.code} faction={faction} />)}
          </div>
        ) : (
          <p className="sigua-wiki-empty-state">No factions found.</p>
        )}
      </div>
    </main>
  );
}
