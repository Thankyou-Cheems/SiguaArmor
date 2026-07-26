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
    foregroundBaselineOffset: -1.8,
    foregroundScale: 0.97,
    logo: "/icons/Faction Icons/adf_flag_display.svg",
  },
  afu: {
    catalogBackground: "/images/faction-bg/AFU.webp",
    foreground: "/images/faction-art/afu-clean.webp",
    foregroundBaselineOffset: 0.39,
    foregroundScale: 0.98,
    logo: "/icons/Faction Icons/afu_flag_display.svg",
  },
  baf: {
    catalogBackground: "/images/faction-bg/BAF.webp",
    foreground: "/images/faction-art/baf-clean.webp",
    foregroundBaselineOffset: -0.57,
    foregroundScale: 1.03,
    logo: "/icons/Faction Icons/baf_flag_display.svg",
  },
  caf: {
    catalogBackground: "/images/faction-bg/CAF.webp",
    foreground: "/images/faction-art/caf-clean.webp",
    foregroundBaselineOffset: -3.8,
    foregroundScale: 0.94,
    logo: "/icons/Faction Icons/caf_flag_display.svg",
  },
  crf: {
    catalogBackground: "/images/faction-bg/CRF.webp",
    foreground: "/images/faction-art/crf-clean.webp",
    foregroundBaselineOffset: 1.4,
    foregroundScale: 1.05,
    logo: "/icons/Faction Icons/crf_flag_display.webp",
  },
  gfi: {
    catalogBackground: "/images/faction-bg/GFI.webp",
    foreground: "/images/faction-art/gfi-clean.webp",
    foregroundBaselineOffset: -2.51,
    foregroundScale: 0.97,
    logo: "/icons/Faction Icons/gfi_flag_display.svg",
  },
  imf: {
    catalogBackground: "/images/faction-bg/IMF.webp",
    foreground: "/images/faction-art/imf-clean.webp",
    foregroundBaselineOffset: 2.14,
    foregroundScale: 1.02,
    // Locally vectorized from the existing IMF flag artwork.
    logo: "/icons/Faction Icons/imf_flag_display.svg",
  },
  mei: {
    // The public asset keeps Squad's INS filename while the catalog group ID is MEI.
    catalogBackground: "/images/faction-bg/INS.webp",
    foreground: "/images/faction-art/ins-clean.webp",
    foregroundBaselineOffset: -3.89,
    foregroundScale: 0.94,
    // INS/MEI uses the locally composed flag with a Commons AK47 vector silhouette.
    logo: "/icons/Faction Icons/ins_flag_display.svg",
  },
  pla: {
    catalogBackground: "/images/faction-bg/PLA.webp",
    foreground: "/images/faction-art/pla-clean.webp",
    foregroundBaselineOffset: -1.55,
    foregroundScale: 0.98,
    logo: "/icons/Faction Icons/pla_flag_display.svg",
  },
  plaagf: {
    catalogBackground: "/images/faction-bg/PLAAGF.webp",
    foreground: "/images/faction-art/plaagf-clean.webp",
    foregroundBaselineOffset: -0.42,
    foregroundScale: 1,
    logo: "/icons/Faction Icons/plaagf_flag_display.webp",
  },
  planmc: {
    catalogBackground: "/images/faction-bg/PLANMC.webp",
    foreground: "/images/faction-art/planmc-clean.webp",
    foregroundBaselineOffset: 7.49,
    foregroundScale: 1.1,
    // Official PLA Navy naval ensign vector from Wikimedia Commons.
    logo: "/icons/Faction Icons/planmc_flag_display.svg",
  },
  rgf: {
    catalogBackground: "/images/faction-bg/RGF.webp",
    foreground: "/images/faction-art/rgf-clean.webp",
    foregroundBaselineOffset: 0.35,
    foregroundScale: 1.04,
    logo: "/icons/Faction Icons/rgf_flag_display.svg",
  },
  tlf: {
    catalogBackground: "/images/faction-bg/TLF.webp",
    foreground: "/images/faction-art/tlf-clean.webp",
    foregroundBaselineOffset: 0.17,
    foregroundScale: 1.01,
    logo: "/icons/Faction Icons/tlf_flag_display.svg",
  },
  usa: {
    catalogBackground: "/images/faction-bg/USA.webp",
    foreground: "/images/faction-art/usa-clean.webp",
    foregroundBaselineOffset: 0.02,
    foregroundScale: 1.02,
    logo: "/icons/Faction Icons/usa_flag_display.svg",
  },
  usmc: {
    catalogBackground: "/images/faction-bg/USMC.webp",
    foreground: "/images/faction-art/usmc-clean.webp",
    foregroundBaselineOffset: 0.65,
    foregroundScale: 1.02,
    logo: "/icons/Faction Icons/usmc_flag_display.svg",
  },
  vdv: {
    catalogBackground: "/images/faction-bg/VDV.webp",
    foreground: "/images/faction-art/vdv-clean.webp",
    foregroundBaselineOffset: -0.39,
    foregroundScale: 0.97,
    logo: "/icons/Faction Icons/vdv_flag_display.svg",
  },
  wpmc: {
    catalogBackground: "/images/faction-bg/WPMC.webp",
    foreground: "/images/faction-art/wpmc-clean.webp",
    foregroundBaselineOffset: 3.5,
    foregroundScale: 1.04,
    logo: "/icons/Faction Icons/wpmc_flag_display.webp",
  },
};
