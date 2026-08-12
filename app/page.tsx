import type { Metadata } from "next";
import { armorUrl } from "../lib/public-site-topology.mjs";
import { CatalogApp } from "./CatalogApp";

export const metadata: Metadata = {
  alternates: { canonical: armorUrl("international") },
  openGraph: { url: armorUrl("international") },
};

export default function Home() {
  return <CatalogApp siteEdition="international" />;
}
