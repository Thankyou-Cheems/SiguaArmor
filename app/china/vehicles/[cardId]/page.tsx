import { CatalogApp } from "../../../CatalogApp";
import { catalogStaticParams } from "../../../../lib/catalog-static-params.mjs";

export function generateStaticParams() {
  return catalogStaticParams("china", "cardId");
}

export default function ChinaVehicleDetailPage() {
  return <CatalogApp siteEdition="china" />;
}
