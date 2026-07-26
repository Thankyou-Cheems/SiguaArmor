import catalogIndexJson from "../../../generated/catalog-index.json";
import { CatalogApp } from "../../CatalogApp";
import type { PublicCatalogIndex } from "../../catalog-types";

export default function VehicleDetailPage() {
  return (
    <CatalogApp
      catalogIndex={catalogIndexJson as unknown as PublicCatalogIndex}
      siteEdition="international"
    />
  );
}
