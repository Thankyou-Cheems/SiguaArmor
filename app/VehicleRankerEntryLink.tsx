import Link from "next/link";
import { ListOrdered } from "lucide-react";

import { armorPath } from "../lib/public-site-topology.mjs";
import type { SiteEdition } from "./site-edition.ts";

function rankerPath(siteEdition: SiteEdition) {
  if (process.env.NODE_ENV === "development") {
    return siteEdition === "china" ? "/china/ranker" : "/ranker";
  }
  return armorPath(siteEdition, "/ranker");
}

export function VehicleRankerEntryLink({
  siteEdition,
}: {
  siteEdition: SiteEdition;
}) {
  return (
    <Link className="vehicle-ranker-entry" href={rankerPath(siteEdition)} prefetch>
      <ListOrdered size={15} aria-hidden="true" />
      <span>从夯到拉</span>
    </Link>
  );
}
