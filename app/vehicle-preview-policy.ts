export const CPV_OFFICIAL_RESOURCE_NOTICE =
  "此载具的官方资源存在问题，暂时无法预览外观，装甲计算仍可用";

export function isCpvVehicleRawName(rawName: string | null | undefined) {
  return /(?:^|_)CPV(?:_|$)/i.test(rawName ?? "");
}

export function officialVehiclePreviewIssue(rawName: string | null | undefined) {
  if (!isCpvVehicleRawName(rawName)) return null;
  return {
    code: "cpv-official-resource",
    message: CPV_OFFICIAL_RESOURCE_NOTICE,
  } as const;
}
