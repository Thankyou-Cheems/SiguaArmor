import type { Metadata } from "next";
import { armorUrl } from "../../lib/public-site-topology.mjs";
import { CatalogApp } from "../CatalogApp";

export const metadata: Metadata = {
  title: {
    absolute: "藤瓜：铁皮大饭堂",
  },
  alternates: { canonical: armorUrl("china") },
  openGraph: { url: armorUrl("china") },
};

export default function ChinaHome() {
  return <CatalogApp siteEdition="china" />;
}
