import type { Metadata } from "next";
import catalogIndexJson from "../../generated/china-catalog-index.json";
import { armorUrl } from "../../lib/public-site-topology.mjs";
import { CatalogApp } from "../CatalogApp";
import type { PublicCatalogIndex } from "../catalog-types";

export const metadata: Metadata = {
  title: {
    absolute: "藤瓜：铁皮大饭堂",
  },
  alternates: { canonical: armorUrl("china") },
  openGraph: { url: armorUrl("china") },
};

export default function ChinaHome() {
  return (
    <CatalogApp
      catalogIndex={catalogIndexJson as unknown as PublicCatalogIndex}
      siteEdition="china"
    />
  );
}
