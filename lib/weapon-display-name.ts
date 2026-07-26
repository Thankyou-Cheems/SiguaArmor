export interface WeaponDisplayIdentity {
  displayName: string;
  gunName: string;
  projectileName: string | null;
}

export interface InfantryWeaponDisplayIdentity extends WeaponDisplayIdentity {
  type: string;
}

const NAMED_WEAPON_TRANSLATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bBGM-71\s+TOW\s+High[- ]Explosive Anti[- ]Tank\b/gi, "BGM-71 TOW“陶式”反坦克导弹"],
  [/\bHJ8L\s+High[- ]Explosive Anti[- ]Tank\b/gi, "HJ-8L“红箭-8L”反坦克导弹"],
  [/\b9M119M\s+Refleks\b/gi, "9M119M Refleks“反射”"],
  [/\b9M113\s+Konkurs\b/gi, "9M113 Konkurs“竞赛”"],
  [/\bHJ-73C\s+Red Arrow\b/gi, "HJ-73C Red Arrow“红箭”"],
  [/\bLAHAT\b/gi, "LAHAT“拉哈特”"],
  [/\bAGS-17\s+Plamya\b/gi, "AGS-17 Plamya“烈火”"],
  [/\bM2A1\s+Browning\b/gi, "M2A1 Browning“勃朗宁”"],
  [/\bArbalet\b/gi, "Arbalet“弩”"],
  [/\bKord\b/gi, "Kord“科尔德”"],
];

/** Shared Wiki/viewer weapon and ammunition display translation. */
export function weaponDisplayNameZh(weapon: WeaponDisplayIdentity) {
  const englishName = weapon.displayName || weapon.gunName;
  let mountLabel: string | null = null;
  const baseEnglishName = englishName
    .replace(/\bCROWS\b/gi, () => {
      mountLabel = "CROWS 遥控武器站";
      return "";
    })
    .replace(/\bRWS\b/gi, () => {
      mountLabel ??= "遥控武器站";
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
  let name = NAMED_WEAPON_TRANSLATIONS.reduce(
    (translatedName, [pattern, replacement]) => translatedName.replace(pattern, replacement),
    baseEnglishName,
  )
    .replace(/(\d+(?:\.\d+)?)mm\b/gi, "$1 毫米")
    .replace(/High[- ]Explosive Anti[- ]Tank/gi, "破甲弹")
    .replace(/Armor[- ]Piercing Discarding Sabot/gi, "脱壳穿甲弹")
    .replace(/Armor[- ]Piercing Sabot/gi, "脱壳穿甲弹")
    .replace(/High[- ]Explosive Fragmentation/gi, "高爆破片弹")
    .replace(/High Explosive Incendiary/gi, "高爆燃烧弹")
    .replace(/High Explosive/gi, "高爆弹")
    .replace(/Fragmentation Tracer/gi, "曳光破片弹")
    .replace(/Fragmentation/gi, "破片弹")
    .replace(/Armor[- ]Piercing Incendiary/gi, "穿甲燃烧弹")
    .replace(/Armor[- ]Piercing/gi, "穿甲弹")
    .replace(/Anti[- ]Tank Guided Missile/gi, "反坦克导弹")
    .replace(/Guided Missile/gi, "导弹")
    .replace(/Coaxial Machine Gun/gi, "同轴机枪")
    .replace(/Automatic Grenade Launcher\s*-\s*HEDP/gi, "自动榴弹发射器（HEDP）")
    .replace(/Grenade Machine Gun/gi, "自动榴弹发射器")
    .replace(/\bHMG\b/gi, "重机枪")
    .replace(/\bS5 Rockets\b/gi, "S-5 火箭弹")
    .replace(/\s+/g, " ")
    .trim();

  const projectile = weapon.projectileName ?? "";
  const alreadyShowsAmmunition = /(穿甲|破甲|高爆|破片|燃烧|曳光|烟雾)弹/.test(name);
  if (/(VOG|35MM|40MM)/i.test(projectile) && !/(榴弹发射器|榴弹)/.test(name)) {
    name = `${name} 自动榴弹发射器`;
  } else if (
    /(50cal|14_5mm)/i.test(projectile) &&
    !alreadyShowsAmmunition &&
    !/机枪/.test(name)
  ) {
    name = `${name} 重机枪`;
  } else if (/7_62mm/i.test(projectile) && !alreadyShowsAmmunition && !/机枪/.test(name)) {
    name = `${name} 机枪`;
  }
  if (mountLabel) name = `${name} · ${mountLabel}`;
  return name;
}

const INFANTRY_NAMED_WEAPON_TRANSLATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bSelf-Loading Pistol Mk3\b/gi, "Mk3 半自动手枪"],
  [/\bCarl Gustav\b/gi, "Carl Gustav“卡尔·古斯塔夫”"],
  [/\bMosin Nagant\b/gi, "Mosin-Nagant“莫辛-纳甘”"],
  [/\bLee-Enfield\b/gi, "Lee-Enfield“李-恩菲尔德”"],
  [/\bMP-443 Grach\b/gi, "MP-443 Grach“乌鸦”"],
  [/\bPKP Pecheneg\b/gi, "PKP Pecheneg“佩切涅格”"],
  [/\bMakarov\b/gi, "Makarov“马卡洛夫”"],
  [/\bTokarev\b/gi, "Tokarev“托卡列夫”"],
  [/\bHi-Power\b/gi, "Hi-Power“勃朗宁大威力”"],
  [/\bVintorez\b/gi, "Vintorez“螺纹切割器”"],
  [/\bNLAW\b/gi, "NLAW 反坦克导弹"],
];

const INFANTRY_WEAPON_TYPE_LABELS: Readonly<Record<string, string>> = {
  Dmr: "精确射手步枪",
  Grenadelauncher: "榴弹发射器",
  Knife: "近战武器",
  Lat: "反装甲武器",
  Machinegun: "机枪",
  Pistol: "手枪",
  Rifle: "步枪",
};

const INFANTRY_WEAPON_TYPE_PATTERN: Readonly<Record<string, RegExp>> = {
  Dmr: /步枪/u,
  Grenadelauncher: /榴弹/u,
  Knife: /刺刀|匕首|近战武器/u,
  Lat: /反装甲武器|反坦克导弹/u,
  Machinegun: /机枪/u,
  Pistol: /手枪/u,
  Rifle: /步枪/u,
};

/** Player-facing infantry label: retain model IDs while translating attachments, ammunition, and type. */
export function infantryWeaponDisplayNameZh(weapon: InfantryWeaponDisplayIdentity) {
  let name = INFANTRY_NAMED_WEAPON_TRANSLATIONS.reduce(
    (translatedName, [pattern, replacement]) => translatedName.replace(pattern, replacement),
    weapon.displayName || weapon.gunName,
  )
    .replace(/High[- ]Explosive Dual Purpose/gi, "高爆双用途弹")
    .replace(/High[- ]Explosive Anti[- ]Tank/gi, "破甲弹")
    .replace(/High[- ]Explosive Fragmentation/gi, "高爆破片弹")
    .replace(/High[- ]Explosive Incendiary/gi, "高爆燃烧弹")
    .replace(/High[- ]Explosive/gi, "高爆弹")
    .replace(/\bHEAA\b/gi, "高爆反装甲弹")
    .replace(/\bHEDM\b/gi, "高爆双用途弹")
    .replace(/\bHEDP\b/gi, "高爆双用途弹")
    .replace(/\bHEAT\b/gi, "破甲弹")
    .replace(/\bHE\b/gi, "高爆弹")
    .replace(/\bTandem\b/gi, "串联破甲弹")
    .replace(/\bFragmentation\b/gi, "破片弹")
    .replace(/\bSmoke\b/gi, "烟雾弹")
    .replace(/\bSpotting Rifle\b/gi, "测距枪")
    .replace(/\bGeneral Service Pistol\b/gi, "制式手枪")
    .replace(/\bRifle Grenade\b/gi, "枪榴弹")
    .replace(/\bForegrip Bipod\b/gi, "两脚架握把")
    .replace(/\bGrip Pod\b/gi, "两脚架握把")
    .replace(/\bGrippod\b/gi, "两脚架握把")
    .replace(/\bForegrip\b/gi, "前握把")
    .replace(/\bExtended Mag\b/gi, "扩容弹匣")
    .replace(/\bDrum Mag\b/gi, "弹鼓")
    .replace(/\bC-mag\b/gi, "弹鼓")
    .replace(/\bSuppressor\b/gi, "消音器")
    .replace(/\bSuppressed\b/gi, "消音型")
    .replace(/\bHolo Sight\b/gi, "全息瞄具")
    .replace(/\bIrons\b/gi, "机械瞄具")
    .replace(/\bOptic\b/gi, "瞄准镜")
    .replace(/\bTracer\b/gi, "曳光弹")
    .replace(/\bBayonet2000\b/gi, "2000 型刺刀")
    .replace(/\bBayonet\b/gi, "刺刀")
    .replace(/\bKnife\b/gi, "匕首")
    .replace(/\bBipod\b/gi, "两脚架")
    .replace(/\s*\+\s*/g, " · ")
    .replace(/\(([^()]*)\)/g, "（$1）")
    .replace(/\s+/g, " ")
    .replace(/\s+（/g, "（")
    .trim();

  const typeLabel = INFANTRY_WEAPON_TYPE_LABELS[weapon.type];
  const typePattern = INFANTRY_WEAPON_TYPE_PATTERN[weapon.type];
  if (typeLabel && typePattern && !typePattern.test(name)) {
    name = `${name} · ${typeLabel}`;
  }
  return name;
}
