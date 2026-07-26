export interface RuntimeHitComponentIdentity {
  componentPath?: string | null;
  componentId?: string | null;
  semanticKind?: string | null;
}

function componentIdentityText(component: RuntimeHitComponentIdentity) {
  return `${component.componentPath ?? ""} ${component.componentId ?? ""}`.toLowerCase();
}

function componentSide(identity: string): "左" | "右" | null {
  if (
    /left|(?:^|[_\s-])l(?:\d|$)|(?:shield|skirt|side|wheel|hatch)l(?:\d|$)/u.test(
      identity,
    )
  ) {
    return "左";
  }
  if (
    /right|(?:^|[_\s-])r(?:\d|$)|(?:shield|skirt|side|wheel|hatch)r(?:\d|$)/u.test(
      identity,
    )
  ) {
    return "右";
  }
  return null;
}

function sideLabel(side: "左" | "右" | null, label: string) {
  return side ? `${side}侧${label}` : label;
}

function armorComponentLabel(identity: string, side: "左" | "右" | null) {
  if (/no[_\s-]?pen|nopen/u.test(identity)) return "不可穿透区";
  if (/watershield|water[_\s-]?shield/u.test(identity)) {
    return sideLabel(side, "防浪板");
  }
  if (/windshield/u.test(identity)) return sideLabel(side, "挡风装甲");
  if (/side[_\s-]?skirt|sideskirt|skirt/u.test(identity)) {
    return side ? `${side}侧裙装甲` : "侧裙装甲";
  }
  if (/rear[_\s-]?fuel|fueltank|fuel[_\s-]?tank/u.test(identity)) {
    return "外置油箱";
  }
  if (/spare[_\s-]?wheel/u.test(identity)) return "备用车轮";
  if (/cage|spaced|addon|technicalarmor/u.test(identity)) return "附加装甲";
  if (/driver/u.test(identity) && /hatch|flap/u.test(identity)) {
    return "驾驶员舱盖";
  }
  if (/passenger/u.test(identity) && /hatch/u.test(identity)) {
    return "乘员舱盖";
  }
  if (/hatch/u.test(identity)) return sideLabel(side, "舱盖装甲");
  if (/turret/u.test(identity)) return "炮塔装甲";
  if (/hull|body/u.test(identity)) return "车体装甲";
  if (/optic|periscope/u.test(identity)) return "观察设备";
  if (/suppl|crate/u.test(identity)) return "补给物资";
  if (/seat/u.test(identity)) return "乘员舱";
  if (/kornet/u.test(identity)) return "反坦克导弹发射器";
  if (/crows|rws/u.test(identity)) return "遥控武器站";
  if (/door/u.test(identity)) return sideLabel(side, "舱门");
  return "车体装甲";
}

function weaponComponentLabel(identity: string) {
  if (/no[_\s-]?pen|nopen/u.test(identity)) return "不可穿透区";
  if (/rocket/u.test(identity)) return "火箭发射器";
  if (/missile|missle|atgm|kornet/u.test(identity)) return "导弹发射器";
  if (/hatch/u.test(identity)) return "武器舱盖";
  if (/base|tripod/u.test(identity)) return "武器基座";
  if (/shield|armor|turret|cage/u.test(identity)) return "武器护盾";
  if (/optic|periscope/u.test(identity)) return "观察设备";
  return "武器组件";
}

/**
 * Converts Editor-facing component identities into short labels intended for
 * players. Raw Blueprint/component names must not leak into the hover readout.
 */
export function playerHitComponentLabel(
  component: RuntimeHitComponentIdentity,
): string {
  const identity = componentIdentityText(component);
  const side = componentSide(identity);

  switch (component.semanticKind) {
    case "armor":
      return armorComponentLabel(identity, side);
    case "penetration-blocker":
      return "不可穿透区";
    case "engine":
      return "发动机";
    case "ammo-rack":
      return "弹药架";
    case "track":
      return sideLabel(side, "履带");
    case "wheel":
      if (/front/u.test(identity)) return "前轮";
      if (/rear/u.test(identity)) return "后轮";
      return sideLabel(side, "车轮");
    case "gun-collision":
      return weaponComponentLabel(identity);
    case "other":
      return /tail[_\s-]?rotor|tailrotor/u.test(identity)
        ? "尾桨"
        : "可损坏部件";
    default:
      if (/engine/u.test(identity)) return "发动机";
      if (/ammo/u.test(identity)) return "弹药架";
      return "车辆部件";
  }
}
