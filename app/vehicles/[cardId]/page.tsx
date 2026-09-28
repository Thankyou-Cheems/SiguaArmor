import { CatalogApp } from "../../CatalogApp";
import { catalogStaticParams } from "../../../lib/catalog-static-params.mjs";

export function generateStaticParams() {
  return catalogStaticParams("international", "cardId");
}

export default function VehicleDetailPage() {
  return <CatalogApp siteEdition="international" />;
}
