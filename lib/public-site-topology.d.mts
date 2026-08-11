export type ArmorEdition = "international" | "china";

export const LANDING_ORIGIN: "https://siguad.icu";
export const ARMOR_ORIGIN: "https://armor.siguad.icu";
export const NAVIGATOR_PATH: "/navigator";
export const NAVIGATOR_URL: "https://siguad.icu/navigator";
export const ICP_RECORD: Readonly<{
  number: "黑ICP备2025043874号-2";
  url: "https://beian.miit.gov.cn/";
}>;
export const PUBLIC_SECURITY_RECORD: Readonly<{
  number: "黑公网安备 23050202000040号";
  url: "https://beian.mps.gov.cn/#/query/webSearch?code=23050202000040";
  appIconUrl: "/images/public-security-record-icon.svg";
  portalIconUrl: "/portal-assets/public-security-record-icon.svg";
}>;
export const ARMOR_EDITIONS: Readonly<
  Record<ArmorEdition, Readonly<{ id: ArmorEdition; basePath: string }>>
>;

export function armorPath(edition: ArmorEdition, pathname?: string): string;
export function armorUrl(edition: ArmorEdition, pathname?: string): string;
export function landingArmorRedirectUrl(
  pathname: string,
  search?: string,
): string | null;
export function originHostname(origin: string): string;
