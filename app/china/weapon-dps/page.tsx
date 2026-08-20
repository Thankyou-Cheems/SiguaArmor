import type { Metadata } from "next";

import { WeaponDpsWorkbench } from "../../WeaponDpsWorkbench";

export const metadata: Metadata = {
  title: "武器节奏与 DPS 对比",
  description: "从 Armor 武器选择器进入的多武器节奏、过热与累计伤害分析。",
};

export default function ChinaWeaponDpsPage() {
  return <WeaponDpsWorkbench siteEdition="china" />;
}
