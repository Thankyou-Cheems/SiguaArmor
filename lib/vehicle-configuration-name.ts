const EXACT_VEHICLE_CONFIGURATION_NAMES_ZH: Readonly<Record<string, string>> = {
  "25mm": "25 毫米",
  "BM-21 Grad": "BM-21“冰雹”",
  CAS: "近距空中支援型",
  "CAS Small": "小型近距空中支援型",
  HMG: "重机枪",
  Logistics: "补给型",
  Mortar: "迫击炮",
  MSV: "机动出生点型",
  Scout: "侦察型",
  Transport: "运输型",
};

/** Localize semantic configuration terms while preserving weapon and vehicle model designations. */
export function vehicleConfigurationNameZh(value: string) {
  const normalized = value
    .trim()
    .replace(/\s*·\s*/g, " · ")
    .replace(/\s+/g, " ");
  if (!normalized) return "";

  const exactName = EXACT_VEHICLE_CONFIGURATION_NAMES_ZH[normalized];
  if (exactName) return exactName;

  const apcMatch = normalized.match(/^APC\s+(.+)$/i);
  if (apcMatch) return `装甲输送型 · ${apcMatch[1]}`;

  const crowsMatch = normalized.match(/^CROWS\s+(.+)$/i);
  if (crowsMatch) return `CROWS遥控武器站 · ${crowsMatch[1]}`;

  const rwsPrefixMatch = normalized.match(/^RWS(?:\s+(.+))?$/i);
  if (rwsPrefixMatch) {
    return rwsPrefixMatch[1]
      ? `遥控武器站 · ${rwsPrefixMatch[1]}`
      : "遥控武器站";
  }

  const rwsSuffixMatch = normalized.match(/^(.+)\s+RWS$/i);
  if (rwsSuffixMatch) return `${rwsSuffixMatch[1]} · 遥控武器站`;

  const minigunMatch = normalized.match(/^(.+)\s+Minigun$/i);
  if (minigunMatch) return `${minigunMatch[1]} · 转管机枪`;

  const transportMatch = normalized.match(/^Transport\s+(.+)$/i);
  if (transportMatch) return `运输型 · ${transportMatch[1]}`;

  const logisticsMatch = normalized.match(/^Logistics\s+(.+)$/i);
  if (logisticsMatch) return `补给型 · ${logisticsMatch[1]}`;

  // Catalog fallbacks are often exact weapon or vehicle subtype designations.
  // Keep unknown designations intact instead of inventing a translation.
  return normalized.replace(/(\d+(?:\.\d+)?)mm\b/gi, "$1 毫米");
}
