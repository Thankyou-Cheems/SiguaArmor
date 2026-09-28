import { CatalogApp } from "../../CatalogApp";
import { catalogStaticParams } from "../../../lib/catalog-static-params.mjs";

export function generateStaticParams() {
  return catalogStaticParams("international", "groupId");
}

export default function FactionCatalogPage() {
  return <CatalogApp siteEdition="international" />;
}
