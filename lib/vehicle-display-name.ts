import { vehicleConfigurationNameZh } from "./vehicle-configuration-name.ts";

const EXACT_VEHICLE_FAMILY_NAMES_ZH: Readonly<Record<string, string>> = {
  "Cobra II": "“眼镜蛇”II",
  Coyote: "“郊狼”",
  FV107: "FV107“弯刀”",
  FV4034: "FV4034“挑战者2”",
  FV510: "FV510“武士”",
  "FV510 UA": "FV510 UA“武士”",
  "KamAZ 5350": "KamAZ-5350“卡玛兹”",
  "Kozak-2M1": "Kozak-2M1“哥萨克”",
  "Leopard 2A6M CAN": "“豹”2A6M CAN",
  "LAV 6": "LAV 6",
  "Light FSV": "轻型火力支援车",
  "Light Transport": "轻型运输车",
  M1A1: "M1A1“艾布拉姆斯”",
  M1A2: "M1A2“艾布拉姆斯”",
  M1126: "M1126“斯崔克”",
  M1128: "M1128“斯崔克”",
  M2A3: "M2A3“布莱德利”",
  "Mi-8": "米-8",
  "Mi-8MTV-5": "米-8MTV-5",
  "Minsk 400": "“明斯克”400 摩托车",
  "Modern Pickup": "现代皮卡",
  "Modern Technical": "现代武装皮卡",
  "MRH-90": "MRH-90“太攀蛇”",
  "Pickup Truck": "皮卡",
  "Quad Bike": "四轮全地形车",
  Raven: "“渡鸦”",
  RHIB: "RHIB 刚性充气艇",
  SA330: "SA330“美洲豹”",
  Safir: "Safir“萨菲尔”",
  Simir: "Simir“西米尔”",
  "Sprut-SDM1": "“章鱼”SDM1",
  Technical: "武装皮卡",
  "Tigr-M": "“虎-M”",
  "UH-1H": "UH-1H“休伊”",
  "UH-1Y": "UH-1Y“毒液”",
  UH60: "UH-60“黑鹰”",
  "UH-60M": "UH-60M“黑鹰”",
  "Z-8G": "直-8G",
  "Z-8J": "直-8J",
  "Z-9A": "直-9A",
};

const VEHICLE_TYPE_NAMES_ZH: Readonly<Record<string, string>> = {
  AH: "攻击直升机",
  APC: "装甲输送车",
  CAS: "攻击机",
  DRONE: "便携侦察无人机",
  IFV: "步兵战车",
  LOGI: "补给载具",
  LTV: "轻型战术载具",
  MBT: "主战坦克",
  MGS: "机动火炮系统",
  MRAP: "防雷反伏击车",
  MSV: "机动出生点载具",
  RSV: "火箭支援车",
  SPA: "自行火炮",
  SPAA: "自行防空炮",
  TD: "坦克歼击车",
  TRAN: "运输载具",
  UAV: "大型侦察无人机",
  UH: "通用直升机",
  ULTV: "超轻型战术载具",
};

const MULTIWORD_VEHICLE_FAMILIES = [
  "Modern Technical",
  "KamAZ 5350",
  "Leopard 2A6M CAN",
  "Cobra II",
  "PARS III",
  "LAV III",
] as const;

export function vehicleFamilyNameZh(value: string) {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized) return "";
  return EXACT_VEHICLE_FAMILY_NAMES_ZH[normalized] ?? normalized;
}

/** Translate a full catalog vehicle label without changing its source identity. */
export function vehicleDisplayNameZh(value: string) {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized) return "";

  const exactName = EXACT_VEHICLE_FAMILY_NAMES_ZH[normalized];
  if (exactName) return exactName;

  const roleFirstMatch = normalized.match(/^(Logistics|Transport)\s+(.+)$/iu);
  if (roleFirstMatch) {
    return `${vehicleFamilyNameZh(roleFirstMatch[2])} · ${
      roleFirstMatch[1].toLocaleLowerCase("en") === "logistics"
        ? "补给型"
        : "运输型"
    }`;
  }

  const multiwordFamily = MULTIWORD_VEHICLE_FAMILIES.find(
    (family) => normalized.startsWith(`${family} `),
  );
  const family = multiwordFamily ?? normalized.split(" ", 1)[0];
  const configuration = normalized.slice(family.length).trim();
  const familyName = vehicleFamilyNameZh(family);
  if (!configuration) return familyName;
  return `${familyName} · ${vehicleConfigurationNameZh(configuration)}`;
}

export function vehicleTypeNameZh(value: string) {
  return VEHICLE_TYPE_NAMES_ZH[value.trim().toLocaleUpperCase("en")] ?? null;
}
