import type { FactionVisualAsset } from "./international-faction-visuals";
import {
  ARMOR_EDITIONS,
  armorPath,
} from "../lib/public-site-topology.mjs";

export type SiteEdition = "international" | "china";

interface SiteEditionProfile {
  basePath: string;
  catalogDataRoot: string;
  switchHref: string;
  switchLabel: string;
  noticeTitle?: string;
  noticeLines: readonly string[];
  showNoticeCountdown: boolean;
}

const SITE_EDITION_PROFILES: Record<SiteEdition, SiteEditionProfile> = {
  international: {
    basePath: ARMOR_EDITIONS.international.basePath,
    catalogDataRoot: "/catalog-data/factions",
    switchHref: armorPath("china"),
    switchLabel: "前往国服站",
    noticeLines: [
      "首次载入大型载具组件包可能需要片刻，请以游戏内实际内容为准。",
    ],
    showNoticeCountdown: false,
  },
  china: {
    basePath: ARMOR_EDITIONS.china.basePath,
    catalogDataRoot: "/catalog-data/china/factions",
    switchHref: armorPath("international"),
    switchLabel: "前往国际站",
    noticeTitle: "国服载具资料库",
    noticeLines: [
      "五阵营目录使用国际版同源数据与查看器，并保留国服名称及贴图合规处理。",
      "首次载入大型载具组件包可能需要片刻，请以游戏内实际内容为准。",
    ],
    showNoticeCountdown: true,
  },
};

export const CHINA_FACTION_IMAGE_ORDER = [
  "ekeqie",
  "agesi",
  "shenzhou",
  "arctic-union",
  "kaweier",
] as const;

export interface ChinaFactionVisualAsset extends FactionVisualAsset {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CHINA_FACTION_VISUAL_ASSETS: Record<string, ChinaFactionVisualAsset> = {
  ekeqie: {
    catalogBackground:
      "/china-assets/local-preview/official/factions/ekeqie-catalog-background.jpg",
    foreground:
      "/china-assets/local-preview/official/factions/ekeqie-foreground-1e2d7a32e8b1.webp",
    logo: "/china-assets/local-preview/official/factions/ekeqie-logo.webp",
    foregroundBaselineOffset: 0,
    foregroundScale: 1,
    x: 277,
    y: 0,
    width: 378,
    height: 1313,
  },
  agesi: {
    catalogBackground:
      "/china-assets/local-preview/official/factions/agesi-catalog-background.jpg",
    foreground:
      "/china-assets/local-preview/official/factions/agesi-foreground-bcfba1e8d6a1.webp",
    logo: "/china-assets/local-preview/official/factions/agesi-logo.webp",
    foregroundBaselineOffset: 0,
    foregroundScale: 1,
    x: 683,
    y: 0,
    width: 417,
    height: 1235,
  },
  shenzhou: {
    catalogBackground:
      "/china-assets/local-preview/official/factions/shenzhou-catalog-background.jpg",
    foreground:
      "/china-assets/local-preview/official/factions/shenzhou-foreground-e9abb2b663a6.webp",
    logo: "/china-assets/local-preview/official/factions/shenzhou-logo.webp",
    foregroundBaselineOffset: 0,
    foregroundScale: 1,
    x: 1076,
    y: 0,
    width: 401,
    height: 1314,
  },
  "arctic-union": {
    catalogBackground:
      "/china-assets/local-preview/official/factions/arctic-union-catalog-background.jpg",
    foreground:
      "/china-assets/local-preview/official/factions/arctic-union-foreground-54374d3e0bc9.webp",
    logo: "/china-assets/local-preview/official/factions/arctic-union-logo.webp",
    foregroundBaselineOffset: 0,
    foregroundScale: 1,
    x: 1508,
    y: 0,
    width: 387,
    height: 1253,
  },
  kaweier: {
    catalogBackground:
      "/china-assets/local-preview/official/factions/kaweier-catalog-background.jpg",
    foreground:
      "/china-assets/local-preview/official/factions/kaweier-foreground-9de382c0458b.webp",
    logo: "/china-assets/local-preview/official/factions/kaweier-logo.webp",
    foregroundBaselineOffset: 0,
    foregroundScale: 1,
    x: 1902,
    y: 0,
    width: 408,
    height: 1320,
  },
};

export function siteEditionProfile(edition: SiteEdition) {
  return SITE_EDITION_PROFILES[edition];
}

export function siteEditionBasePath(edition: SiteEdition) {
  return siteEditionProfile(edition).basePath;
}

export function siteEditionCatalogDataRoot(edition: SiteEdition) {
  return siteEditionProfile(edition).catalogDataRoot;
}
