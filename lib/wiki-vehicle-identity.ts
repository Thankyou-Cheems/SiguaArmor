export function wikiVehicleFactionId(promoEntryId: string) {
  const separator = promoEntryId.indexOf("--");
  const factionId = separator === -1
    ? promoEntryId
    : promoEntryId.slice(0, separator);
  if (!/^[a-z0-9-]+$/u.test(factionId)) {
    throw new Error(`载具 ${promoEntryId} 无法解析 Wiki 阵营`);
  }
  return factionId;
}
