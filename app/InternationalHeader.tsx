"use client";

import { Heart } from "lucide-react";
import { usePathname } from "next/navigation";
import { DailyActiveDisplay } from "./DailyActiveBeacon";
import { IronRiceHallWordmark } from "./IronRiceHallWordmark";
import { internationalPath, stripInternationalBasePath } from "./site-paths";

export function InternationalHeader() {
  const pathname = stripInternationalBasePath(usePathname());
  const activeSection = pathname.startsWith("/wiki/vehicles")
    ? "wiki"
    : pathname.startsWith("/wiki/factions")
      ? "factions"
      : pathname.startsWith("/wiki/weapons")
        ? "weapons"
        : "vehicles";
  const navClassName = (section: typeof activeSection) =>
    `international-nav__link${activeSection === section ? " international-nav__link--active" : ""}`;

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
          <a className={navClassName("vehicles")} href={internationalPath()} aria-current={activeSection === "vehicles" ? "page" : undefined}>VEHICLES</a>
          <a className={navClassName("wiki")} href={internationalPath("/wiki/vehicles")} aria-current={activeSection === "wiki" ? "page" : undefined}>WIKI</a>
          <a className={navClassName("factions")} href={internationalPath("/wiki/factions")} aria-current={activeSection === "factions" ? "page" : undefined}>FACTIONS</a>
          <a className={navClassName("weapons")} href={internationalPath("/wiki/weapons")} aria-current={activeSection === "weapons" ? "page" : undefined}>WEAPONS</a>
        </div>
        <div className="international-nav__side international-nav__side--right">
          <DailyActiveDisplay variant="nav" />
          <span className="international-nav__utility">LOCAL DATA</span>
          <a className="international-nav__support" href={internationalPath()} aria-label="Return to international catalog">
            <Heart size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </nav>
  );
}
