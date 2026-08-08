export type ArmorEdition = "international" | "china";

export const LANDING_ORIGIN: "https://siguad.icu";
export const ARMOR_ORIGIN: "https://armor.siguad.icu";
export const ICP_RECORD: Readonly<{
  number: "黑ICP备2025043874号-2";
  url: "https://beian.miit.gov.cn/";
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
