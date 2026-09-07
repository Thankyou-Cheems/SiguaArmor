const sceneAssetFile = "siguad-realistic-faction-camp-c8e090dbe35a.webp";
const fontAssetFile = "siguad-unbounded-brand-2692bde5f2d52f28.woff2";
const fontLicenseAssetFile =
  "siguad-unbounded-brand-OFL-5eece1beaae1764f.txt";
const armorChinaFigureFile =
  "siguad-armor-china-soldier-ddd587081da0.webp";
const armorGlobalFigureFile =
  "siguad-armor-global-soldier-ccb90707110a.webp";
const brandLogoSourceUrl =
  "https://wiki.siguad.icu/assets/brand/siguad-wiki-logo.svg";

function portalAsset(id, fileName, metadata = {}) {
  return Object.freeze({
    id,
    fileName,
    portalPath: `/portal-assets/${fileName}`,
    ...metadata,
  });
}

const fontAsset = portalAsset(
  "wordmark font",
  fontAssetFile,
  { format: "woff2" },
);
const fontLicenseAsset = portalAsset(
  "wordmark font license",
  fontLicenseAssetFile,
  { license: "SIL Open Font License 1.1" },
);
const sceneAsset = portalAsset(
  "scene",
  sceneAssetFile,
  { width: 1672, height: 941 },
);
const armorChinaFigure = portalAsset(
  "Armor China figure",
  armorChinaFigureFile,
  { width: 399, height: 1043 },
);
const armorGlobalFigure = portalAsset(
  "Armor global figure",
  armorGlobalFigureFile,
  { width: 368, height: 879 },
);
const brandLogoAsset = Object.freeze({
  id: "SiguaD Wiki logo",
  sourceUrl: brandLogoSourceUrl,
  format: "svg",
  width: 810,
  height: 930,
});

export const SITE_PORTAL_BRAND = Object.freeze({
  displayName: "丝瓜地.爱惜呦",
  englishName: "SiguaD.icu",
  fontAsset,
  fontLicenseAsset,
  sceneAsset,
  brandLogoAsset,
  armorFigures: Object.freeze({
    china: armorChinaFigure,
    global: armorGlobalFigure,
  }),
  releaseAssets: Object.freeze([
    fontAsset,
    fontLicenseAsset,
    sceneAsset,
    armorChinaFigure,
    armorGlobalFigure,
  ]),
});
