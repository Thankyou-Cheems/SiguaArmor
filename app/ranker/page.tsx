import type { Metadata } from "next";

import { VehicleRankerApp } from "../VehicleRankerApp.tsx";

export const metadata: Metadata = {
  title: "从夯到拉排名器",
};

export default function VehicleRankerPage() {
  return <VehicleRankerApp siteEdition="international" />;
}
