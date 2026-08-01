import { weaponNameZh } from "./weapon-display-name.ts";

const EXACT_VEHICLE_CONFIGURATION_NAMES_ZH: Readonly<Record<string, string>> = {
  "25mm": "25 毫米机关炮",
  "AGS-17": "AGS-17“烈火”自动榴弹发射器",
  "BM-21 Grad": "BM-21“冰雹”火箭炮",
  "BMP-1": "BMP-1 炮塔",
  C6: "C6 通用机枪",
  CAS: "近距空中支援型",
  "CAS Small": "小型近距空中支援型",
  DSHK: "DShK 重机枪",
  DShK: "DShK 重机枪",
  HJ8: "HJ-8“红箭-8”反坦克导弹",
  HMG: "重机枪",
  IFV: "步兵战车型",
  Kord: "Kord“科尔德”重机枪",
  Kornet: "9M133 Kornet“短号”反坦克导弹",
  Logistics: "补给型",
  M2: "M2 重机枪",
  M121: "M121 迫击炮",
  M134: "M134 转管机枪",
  "M134 Minigun": "M134 转管机枪",
  M240: "M240 通用机枪",
  MGS: "机动火炮系统",
  MAG58: "MAG 58 通用机枪",
  Mag58: "MAG 58 通用机枪",
  MG3: "MG3 通用机枪",
  Mk19: "Mk19 自动榴弹发射器",
  Mortar: "迫击炮",
  MSV: "机动出生点型",
  NSV: "NSV 重机枪",
  PKM: "PKM 通用机枪",
  PKP: "PKP“佩切涅格”通用机枪",
  QJC88: "QJC-88 重机枪",
  QJY88: "QJY-88 通用机枪",
  QJZ89: "QJZ-89 重机枪",
  QLZ87: "QLZ-87 自动榴弹发射器",
  Scout: "侦察型",
  "SPG-9": "SPG-9 无后坐力炮",
  Spandrel: "9M113 Konkurs“竞赛”反坦克导弹",
  TOW: "BGM-71 TOW“陶式”反坦克导弹",
  Transport: "运输型",
  "UB-32": "UB-32 火箭发射器",
  "ZU-23-2": "ZU-23-2 双管高射炮",
  ZU23: "ZU-23-2 双管高射炮",
};

/** Localize semantic configuration terms while preserving weapon and vehicle model designations. */
export function vehicleConfigurationNameZh(value: string): string {
  const normalized = value
    .trim()
    .replace(/\s*·\s*/gu, " · ")
    .replace(/\s+/gu, " ");
  if (!normalized) return "";

  const exactName = EXACT_VEHICLE_CONFIGURATION_NAMES_ZH[normalized];
  if (exactName) return exactName;

  const technicalMatch = normalized.match(/^Technical(?:\s+(.+))?$/iu);
  if (technicalMatch) {
    return technicalMatch[1]
      ? `武装改装型 · ${vehicleConfigurationNameZh(technicalMatch[1])}`
      : "武装改装型";
  }

  const apcMatch = normalized.match(/^APC\s+(.+)$/iu);
  if (apcMatch) {
    return `装甲输送型 · ${vehicleConfigurationNameZh(apcMatch[1])}`;
  }

  const crowsMatch = normalized.match(/^CROWS(?:\s+(.+))?$/iu);
  if (crowsMatch) {
    return crowsMatch[1]
      ? `CROWS 遥控武器站 · ${vehicleConfigurationNameZh(crowsMatch[1])}`
      : "CROWS 遥控武器站";
  }

  const rwsPrefixMatch = normalized.match(/^RWS(?:\s+(.+))?$/iu);
  if (rwsPrefixMatch) {
    return rwsPrefixMatch[1]
      ? `遥控武器站 · ${vehicleConfigurationNameZh(rwsPrefixMatch[1])}`
      : "遥控武器站";
  }

  const rwsSuffixMatch = normalized.match(/^(.+)\s+RWS$/iu);
  if (rwsSuffixMatch) {
    return `${vehicleConfigurationNameZh(rwsSuffixMatch[1])} · 遥控武器站`;
  }

  const minigunMatch = normalized.match(/^(.+)\s+Minigun$/iu);
  if (minigunMatch) {
    const base: string = vehicleConfigurationNameZh(minigunMatch[1]);
    return /机枪/u.test(base) ? base : `${base} · 转管机枪`;
  }

  const transportMatch = normalized.match(/^Transport\s+(.+)$/iu);
  if (transportMatch) {
    return `运输型 · ${vehicleConfigurationNameZh(transportMatch[1])}`;
  }

  const logisticsMatch = normalized.match(/^Logistics\s+(.+)$/iu);
  if (logisticsMatch) {
    return `补给型 · ${vehicleConfigurationNameZh(logisticsMatch[1])}`;
  }

  return weaponNameZh(normalized)
    .replace(/\bKornet“短号”(?!反坦克导弹)/giu, "9M133 Kornet“短号”反坦克导弹")
    .replace(/\bKord“科尔德”(?!重机枪)/giu, "Kord“科尔德”重机枪")
    .replace(/\bUB-32\b/giu, "UB-32 火箭发射器")
    .replace(/\bZU-?23(?:-2)?\b/giu, "ZU-23-2 双管高射炮")
    .replace(/(\d+(?:\.\d+)?)\s*毫米\b/giu, "$1 毫米")
    .replace(/\s+/gu, " ")
    .trim();
}
