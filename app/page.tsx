import type { Metadata } from "next";
import catalogIndexJson from "../generated/catalog-index.json";
import { armorUrl } from "../lib/public-site-topology.mjs";
import { CatalogApp } from "./CatalogApp";
import type { CatalogTopologyIndex } from "./catalog-types";

export const metadata: Metadata = {
  alternates: { canonical: armorUrl("international") },
  openGraph: { url: armorUrl("international") },
};

export default function Home() {
  return (
    <CatalogApp
      catalogIndex={catalogIndexJson as unknown as CatalogTopologyIndex}
      siteEdition="international"
    />
  );
}
