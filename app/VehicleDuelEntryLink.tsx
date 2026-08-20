import Link from "next/link";
import { Swords } from "lucide-react";

import { armorPath } from "../lib/public-site-topology.mjs";
import type { SiteEdition } from "./site-edition.ts";

function duelPath(siteEdition: SiteEdition) {
  if (process.env.NODE_ENV === "development") {
    return siteEdition === "china" ? "/china/duel" : "/duel";
  }
  return armorPath(siteEdition, "/duel");
}

export function VehicleDuelEntryLink({
  siteEdition,
  initialVehicleId,
}: {
  siteEdition: SiteEdition;
  initialVehicleId?: string | null;
}) {
  const path = duelPath(siteEdition);
  const href = initialVehicleId
    ? `${path}?left=${encodeURIComponent(initialVehicleId)}`
    : path;
  return (
    <Link className="vehicle-duel-entry" href={href} prefetch>
      <Swords size={15} aria-hidden="true" />
      <span>载具斗蛐蛐</span>
    </Link>
  );
}
