"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { factionDisplayName } from "../faction-display-name";
import { internationalPath } from "../site-paths";
import {
  factionLabels,
  weaponFactionOptions,
  weaponTypes,
  wikiWeaponConfigurationByKey,
  wikiWeapons,
  type WikiWeapon,
} from "./wiki-data";

type FilterKind = "type" | "faction";

function weaponHref(weapon: WikiWeapon) {
  const key = weapon.weaponKeys?.[0];
  return internationalPath(
    `/wiki/weapons/${encodeURIComponent(key ?? `unknown-${weapon.order}`)}`,
  );
}

function WeaponCard({ weapon }: { weapon: WikiWeapon }) {
  return (
    <a className="sigua-wiki-weapon-card" href={weaponHref(weapon)}>
      <div className="sigua-wiki-weapon-card__image">
        <img src={weapon.imagePath} alt={weapon.fullName} loading="lazy" />
      </div>
      <div className="sigua-wiki-weapon-card__body">
        <div className="sigua-wiki-weapon-card__name">{weapon.displayName}</div>
        <div className="sigua-wiki-weapon-card__type">{weapon.type}</div>
        {weapon.variantCount > 1 ? (
          <span className="sigua-wiki-weapon-card__variants">{weapon.variantCount} variants</span>
        ) : null}
      </div>
    </a>
  );
}

function FilterMenu({
  kind,
  value,
  options,
  onChange,
}: {
  kind: FilterKind;
  value: string;
  options: readonly (readonly [string, string])[] | readonly string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const allLabel = kind === "type" ? "All Types" : "All Factions";
  const selectedLabel = value === "all"
    ? allLabel
    : kind === "type"
      ? value
      : factionLabels[value] ?? factionDisplayName(value);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOptions = options.filter((option) => {
    const label = Array.isArray(option) ? option[1] : option;
    return !normalizedQuery || label.toLocaleLowerCase().includes(normalizedQuery);
  });

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="sigua-wiki-filter" ref={ref}>
      <button
        className="sigua-wiki-filter__trigger"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={10} aria-hidden="true" />
      </button>
      {open ? (
        <div className="sigua-wiki-filter__menu" role="listbox" aria-label={allLabel}>
          <input
            className="sigua-wiki-filter__search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={kind === "type" ? "Search types..." : "Search factions..."}
            autoFocus
          />
          <button type="button" role="option" aria-selected={value === "all"} onClick={() => choose("all")}>
            {allLabel}
          </button>
          {visibleOptions.map((option) => {
            const optionValue = Array.isArray(option) ? option[0] : option;
            const label = Array.isArray(option) ? option[1] : option;
            return (
              <button
                key={optionValue}
                type="button"
                role="option"
                aria-selected={value === optionValue}
                onClick={() => choose(optionValue)}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function WeaponsWiki() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [faction, setFaction] = useState("all");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return wikiWeapons.filter((weapon) => {
      const configurationText = (weapon.weaponKeys ?? [])
        .map((key) => `${key} ${wikiWeaponConfigurationByKey[key]?.displayName ?? ""}`)
        .join(" ");
      const matchesQuery = !needle || `${weapon.displayName} ${weapon.fullName} ${weapon.type} ${configurationText}`
        .toLocaleLowerCase().includes(needle);
      const matchesType = type === "all" || weapon.type === type;
      const matchesFaction = faction === "all" || weapon.factions?.includes(faction);
      return matchesQuery && matchesType && matchesFaction;
    });
  }, [faction, query, type]);

  return (
    <main className="sigua-wiki-wiki-main sigua-wiki-wiki-main--weapons">
      <div className="sigua-wiki-page-wrap sigua-wiki-page-wrap--weapons">
        <div className="sigua-wiki-page-heading sigua-wiki-page-heading--weapons">
          <div className="sigua-wiki-page-heading__title-row">
            <span aria-hidden="true" />
            <h1>Wiki - Weapons</h1>
          </div>
        </div>
        <div className="sigua-wiki-weapon-toolbar">
          <button className="sigua-wiki-show-all" type="button" disabled>SHOW ALL</button>
          <label className="sigua-wiki-search sigua-wiki-search--weapons">
            <Search size={13} aria-hidden="true" />
            <span className="sigua-wiki-visually-hidden">Search weapons</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search weapons..."
            />
          </label>
          <FilterMenu kind="type" value={type} options={weaponTypes} onChange={setType} />
          <FilterMenu kind="faction" value={faction} options={weaponFactionOptions} onChange={setFaction} />
        </div>
        {filtered.length > 0 ? (
          <div className="sigua-wiki-weapon-grid">
            {filtered.map((weapon) => <WeaponCard key={`${weapon.order}-${weapon.fullName}`} weapon={weapon} />)}
          </div>
        ) : (
          <p className="sigua-wiki-empty-state">No weapons found.</p>
        )}
      </div>
    </main>
  );
}
