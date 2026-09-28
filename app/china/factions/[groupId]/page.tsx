import { CatalogApp } from "../../../CatalogApp";
import { catalogStaticParams } from "../../../../lib/catalog-static-params.mjs";

export function generateStaticParams() {
  return catalogStaticParams("china", "groupId");
}

export default function ChinaFactionCatalogPage() {
  return <CatalogApp siteEdition="china" />;
}
