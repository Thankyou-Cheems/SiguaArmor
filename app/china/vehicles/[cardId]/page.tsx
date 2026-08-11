import catalogIndexJson from "../../../../generated/china-catalog-index.json";
import { CatalogApp } from "../../../CatalogApp";
import type { CatalogTopologyIndex } from "../../../catalog-types";

export default function ChinaVehicleDetailPage() {
  return (
    <CatalogApp
      catalogIndex={catalogIndexJson as unknown as CatalogTopologyIndex}
      siteEdition="china"
    />
  );
}
