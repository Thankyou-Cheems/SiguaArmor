"use client";

import { Heart } from "lucide-react";
import { DailyActiveDisplay } from "./DailyActiveBeacon";
import { IronRiceHallWordmark } from "./IronRiceHallWordmark";
import { internationalPath } from "./site-paths";
import { SIGUA_WIKI_ORIGIN } from "../lib/wiki-source";

export function InternationalHeader() {
  return (
    <nav className="international-nav" aria-label="Primary navigation">
      <div className="international-nav__inner">
        <div className="international-nav__side">
          <div className="international-nav__brand-group">
            <a className="international-nav__brand" href={internationalPath()} aria-label="International catalog">
              <IronRiceHallWordmark />
              <span>INTERNATIONAL</span>
            </a>
            <a className="international-nav__edition-switch" href="/sigua/">
              国服站
            </a>
          </div>
        </div>
        <div className="international-nav__center">
          <a className="international-nav__link international-nav__link--active" href={internationalPath()} aria-current="page">VEHICLES</a>
          <a className="international-nav__link" href={SIGUA_WIKI_ORIGIN}>WIKI</a>
        </div>
        <div className="international-nav__side international-nav__side--right">
          <DailyActiveDisplay variant="nav" />
          <span className="international-nav__utility">WIKI DATA</span>
          <a className="international-nav__support" href={internationalPath()} aria-label="Return to international catalog">
            <Heart size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </nav>
  );
}
