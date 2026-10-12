import type { Metadata } from "next";
import { armorUrl } from "../lib/public-site-topology.mjs";
import { CatalogApp } from "./CatalogApp";
import { FACTION_VISUAL_ASSETS } from "./international-faction-visuals";
import { characterPortraitSizes } from "./international-faction-portrait-delivery";

export const metadata: Metadata = {
  alternates: { canonical: armorUrl("international") },
  openGraph: { url: armorUrl("international") },
};

export default function Home() {
  const portrait = FACTION_VISUAL_ASSETS.adf;
  return (
    <>
      <link
        rel="preload"
        as="image"
        href={portrait.foreground}
        imageSrcSet={portrait.foregroundSrcSet}
        imageSizes={characterPortraitSizes(portrait.foregroundScale)}
        fetchPriority="high"
      />
      <CatalogApp siteEdition="international" />
    </>
  );
}
