import factionFlagAssets from "../generated/international-faction-flag-assets.json";
import { wikiUrl } from "../lib/wiki-source";

const factionFlag = (pathname: string) => wikiUrl(pathname);

export interface FactionVisualAsset {
  catalogBackground: string;
  foreground: string;
  foregroundBaselineOffset: number;
  foregroundScale: number;
  logo: string;
}

export const FACTION_IMAGE_ORDER = [
  "adf",
  "afu",
  "baf",
  "caf",
  "crf",
  "gfi",
  "imf",
  "mei",
  "plaagf",
  "pla",
  "planmc",
  "rgf",
  "tlf",
  "usa",
  "usmc",
  "vdv",
  "wpmc",
] as const;

export const FACTION_VISUAL_ASSETS: Record<string, FactionVisualAsset> = {
  adf: {
    catalogBackground: "/images/faction-bg/ADF.webp",
    foreground: "/images/faction-art/adf-clean.webp",
    foregroundBaselineOffset: -5.15,
    foregroundScale: 0.912,
    logo: factionFlag(factionFlagAssets.adf),
  },
  afu: {
    catalogBackground: "/images/faction-bg/AFU.webp",
    foreground: "/images/faction-art/afu-clean.webp",
    foregroundBaselineOffset: 3.46,
    foregroundScale: 1.089,
    logo: factionFlag(factionFlagAssets.afu),
  },
  baf: {
    catalogBackground: "/images/faction-bg/BAF.webp",
    foreground: "/images/faction-art/baf-clean.webp",
    foregroundBaselineOffset: -0.24,
    foregroundScale: 1.013,
    logo: factionFlag(factionFlagAssets.baf),
  },
  caf: {
    catalogBackground: "/images/faction-bg/CAF.webp",
    foreground: "/images/faction-art/caf-clean.webp",
    foregroundBaselineOffset: 0.33,
    foregroundScale: 1.032,
    logo: factionFlag(factionFlagAssets.caf),
  },
  crf: {
    catalogBackground: "/images/faction-bg/CRF.webp",
    foreground: "/images/faction-art/crf-clean.webp",
    foregroundBaselineOffset: -0.7,
    foregroundScale: 1.037,
    logo: factionFlag(factionFlagAssets.crf),
  },
  gfi: {
    catalogBackground: "/images/faction-bg/GFI.webp",
    foreground: "/images/faction-art/gfi-clean.webp",
    foregroundBaselineOffset: 4.4,
    foregroundScale: 1.092,
    logo: factionFlag(factionFlagAssets.gfi),
  },
  imf: {
    catalogBackground: "/images/faction-bg/IMF.webp",
    foreground: "/images/faction-art/imf-clean.webp",
    foregroundBaselineOffset: -4.36,
    foregroundScale: 0.923,
    // Derived from the reviewed IMF flag artwork.
    logo: factionFlag(factionFlagAssets.imf),
  },
  mei: {
    // The public asset keeps Squad's INS filename while the catalog group ID is MEI.
    catalogBackground: "/images/faction-bg/INS.webp",
    foreground: "/images/faction-art/ins-clean.webp",
    foregroundBaselineOffset: 6.63,
    foregroundScale: 1.152,
    // INS/MEI uses the reviewed composite with a Commons AK47 vector silhouette.
    logo: factionFlag(factionFlagAssets.mei),
  },
  pla: {
    catalogBackground: "/images/faction-bg/PLA.webp",
    foreground: "/images/faction-art/pla-clean.webp",
    foregroundBaselineOffset: -2.89,
    foregroundScale: 0.969,
    logo: factionFlag(factionFlagAssets.pla),
  },
  plaagf: {
    catalogBackground: "/images/faction-bg/PLAAGF.webp",
    foreground: "/images/faction-art/plaagf-clean.webp",
    foregroundBaselineOffset: -3.41,
    foregroundScale: 0.942,
    logo: factionFlag(factionFlagAssets.plaagf),
  },
  planmc: {
    catalogBackground: "/images/faction-bg/PLANMC.webp",
    foreground: "/images/faction-art/planmc-clean.webp",
    foregroundBaselineOffset: -3.97,
    foregroundScale: 0.933,
    // Official PLA Navy naval ensign vector from Wikimedia Commons.
    logo: factionFlag(factionFlagAssets.planmc),
  },
  rgf: {
    catalogBackground: "/images/faction-bg/RGF.webp",
    foreground: "/images/faction-art/rgf-clean.webp",
    foregroundBaselineOffset: -4.32,
    foregroundScale: 0.943,
    logo: factionFlag(factionFlagAssets.rgf),
  },
  tlf: {
    catalogBackground: "/images/faction-bg/TLF.webp",
    foreground: "/images/faction-art/tlf-clean.webp",
    foregroundBaselineOffset: 1.79,
    foregroundScale: 1.055,
    logo: factionFlag(factionFlagAssets.tlf),
  },
  usa: {
    catalogBackground: "/images/faction-bg/USA.webp",
    foreground: "/images/faction-art/usa-clean.webp",
    foregroundBaselineOffset: 6.18,
    foregroundScale: 1.117,
    logo: factionFlag(factionFlagAssets.usa),
  },
  usmc: {
    catalogBackground: "/images/faction-bg/USMC.webp",
    foreground: "/images/faction-art/usmc-clean.webp",
    foregroundBaselineOffset: -0.49,
    foregroundScale: 0.996,
    logo: factionFlag(factionFlagAssets.usmc),
  },
  vdv: {
    catalogBackground: "/images/faction-bg/VDV.webp",
    foreground: "/images/faction-art/vdv-clean.webp",
    foregroundBaselineOffset: -1.22,
    foregroundScale: 0.964,
    logo: factionFlag(factionFlagAssets.vdv),
  },
  wpmc: {
    catalogBackground: "/images/faction-bg/WPMC.webp",
    foreground: "/images/faction-art/wpmc-clean.webp",
    foregroundBaselineOffset: -0.78,
    foregroundScale: 0.996,
    logo: factionFlag(factionFlagAssets.wpmc),
  },
};
