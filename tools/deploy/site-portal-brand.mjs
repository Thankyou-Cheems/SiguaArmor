const sceneAssetFile = "siguad-realistic-faction-camp-c8e090dbe35a.webp";
const fontAssetFile = "siguad-unbounded-brand-2692bde5f2d52f28.woff2";
const fontLicenseAssetFile =
  "siguad-unbounded-brand-OFL-f6b8c350c9a49799.txt";
const armorChinaFigureFile =
  "siguad-armor-china-soldier-ddd587081da0.webp";
const armorGlobalFigureFile =
  "siguad-armor-global-soldier-ccb90707110a.webp";

function portalAsset(id, fileName, sha256, metadata = {}) {
  return Object.freeze({
    id,
    fileName,
    portalPath: `/portal-assets/${fileName}`,
    releasePath: `/images/site/${fileName}`,
    sha256,
    ...metadata,
  });
}

const fontAsset = portalAsset(
  "wordmark font",
  fontAssetFile,
  "2692bde5f2d52f283b166069e554202d7bbfaf719047698e50c4ac6d2d246e8d",
  { bytes: 3656, format: "woff2" },
);
const fontLicenseAsset = portalAsset(
  "wordmark font license",
  fontLicenseAssetFile,
  "f6b8c350c9a497994de2f3ead0e76dbb08d3f66639e45857d6010f44eaedb2b0",
  { bytes: 4665, license: "SIL Open Font License 1.1" },
);
const sceneAsset = portalAsset(
  "scene",
  sceneAssetFile,
  "c8e090dbe35afcc2f46985d66afbb810c5d1e5c9465d08d05cff2b2e21ca13f1",
  { width: 1672, height: 941 },
);
const armorChinaFigure = portalAsset(
  "Armor China figure",
  armorChinaFigureFile,
  "ddd587081da0bc1c7fdec282697fef7b68020d53760e47915a4f52e037a7438d",
  { bytes: 207514, width: 399, height: 1043 },
);
const armorGlobalFigure = portalAsset(
  "Armor global figure",
  armorGlobalFigureFile,
  "ccb90707110abbddd63c3cd1e9683d7a4c4ddb101d16713ca5d9150a99477de4",
  { bytes: 223786, width: 368, height: 879 },
);

export const SITE_PORTAL_BRAND = Object.freeze({
  displayName: "丝瓜地.爱惜呦",
  englishName: "SiguaD.icu",
  fontAsset,
  fontLicenseAsset,
  sceneAsset,
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
