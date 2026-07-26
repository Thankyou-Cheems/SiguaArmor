const FACTION_DISPLAY_NAMES: Record<string, string> = {
  SHENZHOU: "神州防御共同体",
  "ARCTIC-UNION": "北极国家联合体",
  AGESI: "阿格西联邦",
  EKEQIE: "埃克切公国",
  KAWEIER: "卡维尔盟约国",
  ADF: "澳大利亚国防军",
  AFU: "乌克兰武装部队",
  BAF: "英国武装部队",
  CAF: "加拿大武装部队",
  CIV: "平民",
  CRF: "加拿大抵抗军",
  GFI: "伊朗地面部队",
  IMF: "非正规民兵",
  MEI: "中东叛乱分子",
  OPFOR: "敌对势力",
  PLA: "PLA",
  PLAAGF: "PLA两栖地面部队",
  PLANMC: "PLA海军陆战队",
  RGF: "俄罗斯陆军",
  TLF: "土耳其陆军",
  USA: "美国陆军",
  USMC: "美国海军陆战队",
  USMC_COOP: "美国海军陆战队（合作模式）",
  VDV: "俄罗斯空降兵",
  WPMC: "西方私人军事承包商",
  WPMC_COOP: "西方私人军事承包商（合作模式）",
};

const SOURCE_NAME_DISPLAY_NAMES: Record<string, string> = {
  "Australian Defence Force": "澳大利亚国防军",
  "Armed Forces of Ukraine": "乌克兰武装部队",
  "British Armed Forces": "英国武装部队",
  "Canadian Armed Forces": "加拿大武装部队",
  Civilians: "平民",
  "Canadian Resistance Forces": "加拿大抵抗军",
  "Ground Forces of Iran": "伊朗地面部队",
  "Irregular Militia Forces": "非正规民兵",
  "Middle Eastern Insurgents": "中东叛乱分子",
  "People's Liberation Army": "PLA",
  "PLA Amphibious Ground Forces": "PLA两栖地面部队",
  "PLA Navy Marine Corps": "PLA海军陆战队",
  "Russian Ground Forces": "俄罗斯陆军",
  "Turkish Land Forces": "土耳其陆军",
  "United States Army": "美国陆军",
  "United States Marine Corps": "美国海军陆战队",
  "Russian Airborne Forces": "俄罗斯空降兵",
  "Western Private Military Contractors": "西方私人军事承包商",
};

export function factionDisplayName(idOrName: string | null | undefined) {
  if (!idOrName) return idOrName ?? "";
  const value = idOrName.trim();
  return FACTION_DISPLAY_NAMES[value.toLocaleUpperCase("en-US")] ?? SOURCE_NAME_DISPLAY_NAMES[value] ?? value;
}
