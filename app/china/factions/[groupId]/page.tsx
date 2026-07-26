import catalogIndexJson from "../../../../generated/china-catalog-index.json";
import { CatalogApp } from "../../../CatalogApp";
import type { PublicCatalogIndex } from "../../../catalog-types";

export default function ChinaFactionCatalogPage() {
  return (
    <CatalogApp
      catalogIndex={catalogIndexJson as unknown as PublicCatalogIndex}
      siteEdition="china"
    />
  );
}
