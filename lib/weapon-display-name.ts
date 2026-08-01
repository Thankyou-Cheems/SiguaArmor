export interface WeaponDisplayIdentity {
  displayName: string;
  gunName: string;
  projectileName: string | null;
}

export interface InfantryWeaponDisplayIdentity extends WeaponDisplayIdentity {
  type: string;
}

const EXACT_EQUIPMENT_NAMES_ZH: Readonly<Record<string, string>> = {
  "Ammo Bag": "弹药包",
  "Cell Phone Detonator": "手机起爆器",
  "Decoy Rock": "伪装石",
  "Drone Controller": "无人机控制器",
  "Field Binoculars": "野战望远镜",
  "Field Dressing": "急救绷带",
  "Improvised Explosive Device": "简易爆炸装置",
  "Infantry Camo Net": "步兵伪装网",
  "Medical Kit": "医疗包",
  "Rally Point": "集结点",
  "Razor Wire": "铁丝网",
  "Recon Drone": "侦察无人机",
  Sandbags: "沙袋",
  "Vehicle Repair Tools": "载具维修工具",
};

const NAMED_WEAPON_TRANSLATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bKornet[“"]康纳特[”"]/giu, "Kornet“短号”"],
  [/\bBGM-71\s+TOW\b(?![“"])/giu, "BGM-71 TOW“陶式”"],
  [/\bHJ8L\b(?![“"])/giu, "HJ-8L“红箭-8L”"],
  [/\b9M119M\s+Refleks\b(?![“"])/giu, "9M119M Refleks“反射”"],
  [/\b9M117M1\s+Bastion\b(?![“"])/giu, "9M117M1 Bastion“堡垒”"],
  [/\b9M113\s+Konkurs\b(?![“"])/giu, "9M113 Konkurs“竞赛”"],
  [/\b9M14P\s+Malyutka-P\b(?![“"])/giu, "9M14P Malyutka-P“马柳特卡”"],
  [/\bHJ-73C\s+Red Arrow\b(?![“"])/giu, "HJ-73C“红箭”"],
  [/\bLAHAT\b(?![“"])/giu, "LAHAT“拉哈特”"],
  [/\bAGS-17\s+Plamya\b(?![“"])/giu, "AGS-17 Plamya“烈火”"],
  [/\bM2A1\s+Browning\b(?![“"])/giu, "M2A1 Browning“勃朗宁”"],
  [/\bCarl Gustav\b(?![“"])/giu, "Carl Gustav“卡尔·古斯塔夫”"],
  [/\bMosin(?:-|\s+)Nagant\b(?![“"])/giu, "Mosin-Nagant“莫辛-纳甘”"],
  [/\bLee-Enfield\b(?![“"])/giu, "Lee-Enfield“李-恩菲尔德”"],
  [/\bMP-443\s+Grach\b(?![“"])/giu, "MP-443 Grach“乌鸦”"],
  [/\bPKP\s+Pecheneg\b(?![“"])/giu, "PKP Pecheneg“佩切涅格”"],
  [/\bMakarov\b(?![“"])/giu, "Makarov“马卡洛夫”"],
  [/\bTokarev\b(?![“"])/giu, "Tokarev“托卡列夫”"],
  [/\bHi-Power\b(?![“"])/giu, "Hi-Power“勃朗宁大威力”"],
  [/\bSelf-Loading Pistol Mk3\b(?![“"])/giu, "Self-Loading Pistol Mk3“勃朗宁大威力”"],
  [/\bVz\.\s*61\s+Škorpion\b(?![“"])/giu, "Vz.61“蝎”式冲锋手枪"],
  [/\bArbalet\b(?![“"])/giu, "Arbalet“弩”"],
  [/\bKord\b(?![“"])/giu, "Kord“科尔德”"],
  [/\bKornet\b(?![“"])/giu, "Kornet“短号”"],
  [/\bKonkurs\b(?![“"])/giu, "Konkurs“竞赛”"],
  [/\bRefleks\b(?![“"])/giu, "Refleks“反射”"],
  [/\bBastion\b(?![“"])/giu, "Bastion“堡垒”"],
];

/** Translate player-facing military terminology while preserving model designations. */
export function weaponNameZh(value: string) {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized) return "";

  const exactName = EXACT_EQUIPMENT_NAMES_ZH[normalized];
  if (exactName) return exactName;

  return NAMED_WEAPON_TRANSLATIONS.reduce(
    (translatedName, [pattern, replacement]) =>
      translatedName.replace(pattern, replacement),
    normalized,
  )
    .replace(/(\d+(?:\.\d+)?)\s*mm\b/giu, "$1 毫米")
    .replace(/\bHigh[- ]Explosive Dual Purpose\b/giu, "高爆双用途弹")
    .replace(/\bHigh[- ]Explosive Anti[- ]Tank\b/giu, "破甲弹")
    .replace(/\bHigh[- ]Explosive Fragmentation\b/giu, "高爆破片弹")
    .replace(/\bHigh[- ]Explosive Incendiary\b/giu, "高爆燃烧弹")
    .replace(/\bHigh[- ]Explosive Tracer\b/giu, "高爆曳光弹")
    .replace(/\bHigh[- ]Explosive\b/giu, "高爆弹")
    .replace(/\bArmor[- ]Piercing Discarding Sabot\b/giu, "脱壳穿甲弹")
    .replace(/\bArmor[- ]Piercing Sabot\b/giu, "脱壳穿甲弹")
    .replace(/\bArmor[- ]Piercing Incendiary\b/giu, "穿甲燃烧弹")
    .replace(/\bArmor[- ]Piercing\b/giu, "穿甲弹")
    .replace(/\bGeneral[- ]Purpose Tracer\b/giu, "多用途曳光弹")
    .replace(/\bFragmentation Tracer\b/giu, "曳光破片弹")
    .replace(/\bAnti[- ]Tank Guided Missile\b/giu, "反坦克导弹")
    .replace(/\bGuided Missile\b/giu, "制导导弹")
    .replace(/\bAutomatic Grenade Launcher\s*-\s*HEDP\b/giu, "自动榴弹发射器（高爆双用途弹）")
    .replace(/\bAutomatic Grenade Launcher\b/giu, "自动榴弹发射器")
    .replace(/\bGrenade Machine Gun\b/giu, "自动榴弹发射器")
    .replace(/\bGrenade Launcher\b/giu, "榴弹发射器")
    .replace(/\bCoaxial Machine Gun\b/giu, "同轴机枪")
    .replace(/\bGeneral[- ]Purpose Machine Gun\b/giu, "通用机枪")
    .replace(/\bHeavy Machine Gun\b/giu, "重机枪")
    .replace(/\bRemote Weapon Station\b/giu, "遥控武器站")
    .replace(/\bAnti[- ]Tank Mine\b/giu, "反坦克地雷")
    .replace(/\bImprovised Explosive Device\b/giu, "简易爆炸装置")
    .replace(/\bSmoke Marker White\b/giu, "白色标记烟雾弹")
    .replace(/\bSmoke Grenade\b/giu, "烟雾弹")
    .replace(/\bRifle Grenade\b/giu, "枪榴弹")
    .replace(/\bSpotting Rifle\b/giu, "测距枪")
    .replace(/\bGeneral Service Pistol\b/giu, "制式手枪")
    .replace(/\bForegrip Bipod\b/giu, "握把式两脚架")
    .replace(/\bGrip Pod\b/giu, "握把式两脚架")
    .replace(/\bGrippod\b/giu, "握把式两脚架")
    .replace(/\bForegrip\b/giu, "前握把")
    .replace(/\bExtended Mag\b/giu, "扩容弹匣")
    .replace(/\bDrum Mag\b/giu, "弹鼓")
    .replace(/\bC-mag\b/giu, "弹鼓")
    .replace(/\bSuppressor\b/giu, "消声器")
    .replace(/\bSuppressed\b/giu, "消声型")
    .replace(/消音器/gu, "消声器")
    .replace(/消音型/gu, "消声型")
    .replace(/\bHolo Sight\b/giu, "全息瞄具")
    .replace(/\bIrons\b/giu, "机械瞄具")
    .replace(/\bOptic\b/giu, "瞄准镜")
    .replace(/\bBayonet2000\b/giu, "2000 型刺刀")
    .replace(/\bBayonet\b/giu, "刺刀")
    .replace(/\bKnife\b/giu, "匕首")
    .replace(/\bBipod\b/giu, "两脚架")
    .replace(/\bMinigun\b/giu, "转管机枪")
    .replace(/\bField Binoculars\b/giu, "野战望远镜")
    .replace(/\bField Dressing\b/giu, "急救绷带")
    .replace(/\bEntrenching Tool\b/giu, "工兵锹")
    .replace(/\bSpade\b/giu, "工兵锹")
    .replace(/\bEngineer\b/giu, "工程兵")
    .replace(/\bSapper\b/giu, "工兵")
    .replace(/\bDetonator\b/giu, "起爆器")
    .replace(/\bTandem\b/giu, "串联战斗部")
    .replace(/\bSquash Head\b/giu, "碎甲弹")
    .replace(/\bTelescoped\b/giu, "埋头弹")
    .replace(/\bFragmentation\b/giu, "破片弹")
    .replace(/\bSmoke\b/giu, "烟雾弹")
    .replace(/\bTracer\b/giu, "曳光弹")
    .replace(/\bRockets?\b/giu, "火箭弹")
    .replace(/\bMissile\b/giu, "导弹")
    .replace(/\bExplosive\b/giu, "炸药")
    .replace(/\bMachine Gun\b/giu, "机枪")
    .replace(/\bHMG\b/giu, "重机枪")
    .replace(/\bHEAA\b/giu, "高爆反装甲弹")
    .replace(/\bHEDM\b/giu, "高爆双用途弹")
    .replace(/\bHEDP\b/giu, "高爆双用途弹")
    .replace(/\bHEAT\b/giu, "破甲弹")
    .replace(/\bHE\b/giu, "高爆弹")
    .replace(/\s*\+\s*/gu, " · ")
    .replace(/\(([^()]*)\)/gu, "（$1）")
    .replace(/\s+/gu, " ")
    .replace(/\s+（/gu, "（")
    .replace(/\s+([·，。；：）])/gu, "$1")
    .trim();
}

/** Shared Wiki/viewer vehicle-weapon and ammunition display translation. */
export function weaponDisplayNameZh(weapon: WeaponDisplayIdentity) {
  const englishName = weapon.displayName || weapon.gunName;
  let mountLabel: string | null = null;
  const baseEnglishName = englishName
    .replace(/\bCROWS\b/giu, () => {
      mountLabel = "CROWS 遥控武器站";
      return "";
    })
    .replace(/\bRWS\b/giu, () => {
      mountLabel ??= "遥控武器站";
      return "";
    })
    .replace(/\s+/gu, " ")
    .trim();
  let name = weaponNameZh(baseEnglishName);

  const projectile = weapon.projectileName ?? "";
  const alreadyShowsAmmunition = /(穿甲|破甲|高爆|破片|燃烧|曳光|烟雾)弹/u.test(name);
  if (/(VOG|35MM|40MM)/iu.test(projectile) && !/(榴弹发射器|榴弹)/u.test(name)) {
    name = `${name} 自动榴弹发射器`;
  } else if (
    /(Kornet|TOW|Konkurs|Refleks|ATGM|HJ[-_]?8|HJ[-_]?73|LAHAT)/iu.test(projectile) &&
    !/导弹/u.test(name)
  ) {
    name = `${name} 反坦克导弹`;
  } else if (
    /(50cal|14_5mm)/iu.test(projectile) &&
    !alreadyShowsAmmunition &&
    !/机枪/u.test(name)
  ) {
    name = `${name} 重机枪`;
  } else if (/7_62mm/iu.test(projectile) && !alreadyShowsAmmunition && !/机枪/u.test(name)) {
    name = `${name} 机枪`;
  }
  if (mountLabel) name = `${name} · ${mountLabel}`;
  return name;
}

const INFANTRY_WEAPON_TYPE_LABELS: Readonly<Record<string, string>> = {
  Binoculars: "望远镜",
  Detonator: "起爆器",
  Dmr: "精确射手步枪",
  Explosives: "爆炸物",
  Fielddressing: "急救用品",
  Fraggrenade: "破片手榴弹",
  Grenadelauncher: "榴弹发射器",
  Knife: "近战武器",
  Lat: "反装甲武器",
  Machinegun: "机枪",
  Medkit: "医疗包",
  Pistol: "手枪",
  Rally: "集结点",
  Repair: "维修工具",
  Resupply: "弹药补给",
  Rifle: "步枪",
  Shovel: "工兵锹",
  Smokegrenade: "烟雾弹",
  Unknown: "其他装备",
};

const INFANTRY_WEAPON_TYPE_PATTERN: Readonly<Record<string, RegExp>> = {
  Binoculars: /望远镜/u,
  Detonator: /起爆器/u,
  Dmr: /精确射手步枪/u,
  Explosives: /炸药|爆炸装置|爆炸物/u,
  Fielddressing: /急救/u,
  Fraggrenade: /破片手榴弹|破片弹/u,
  Grenadelauncher: /榴弹发射器/u,
  Knife: /刺刀|匕首|近战武器/u,
  Lat: /反装甲武器|反坦克导弹/u,
  Machinegun: /机枪/u,
  Medkit: /医疗包/u,
  Pistol: /手枪/u,
  Rally: /集结点/u,
  Repair: /维修工具/u,
  Resupply: /弹药包|弹药补给/u,
  Rifle: /步枪/u,
  Shovel: /工兵锹/u,
  Smokegrenade: /烟雾弹/u,
  Unknown: /其他装备/u,
};

export function infantryWeaponTypeNameZh(type: string) {
  return INFANTRY_WEAPON_TYPE_LABELS[type] ?? type;
}

/** Player-facing infantry label: retain model IDs while translating attachments, ammunition, and type. */
export function infantryWeaponDisplayNameZh(weapon: InfantryWeaponDisplayIdentity) {
  let name = weaponNameZh(weapon.displayName || weapon.gunName);
  if (/\bNLAW\b/iu.test(name) && !/反坦克导弹/u.test(name)) {
    name = `${name} 反坦克导弹`;
  }

  const typeLabel = INFANTRY_WEAPON_TYPE_LABELS[weapon.type];
  const typePattern = INFANTRY_WEAPON_TYPE_PATTERN[weapon.type];
  if (typeLabel && typePattern && !typePattern.test(name)) {
    name = `${name} · ${typeLabel}`;
  }
  return name;
}
