import type { Metadata } from "next";
import { Suspense } from "react";

import { VehicleDuelApp } from "../../VehicleDuelApp.tsx";

export const metadata: Metadata = {
  title: "载具斗蛐蛐",
};

export default function ChinaVehicleDuelPage() {
  return (
    <Suspense fallback={<main className="vehicle-duel vehicle-duel--loading"><strong>正在载入载具斗蛐蛐</strong></main>}>
      <VehicleDuelApp siteEdition="china" />
    </Suspense>
  );
}
