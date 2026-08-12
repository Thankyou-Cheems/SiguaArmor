import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ARMOR_ORIGIN } from "../lib/public-site-topology.mjs";
import { VEHICLE_MODEL_CATEGORY_CSS_VARIABLES } from "../lib/vehicle-model-category-palette";
import "./globals.css";
import { DailyActiveProvider } from "./DailyActiveBeacon";

export const metadata: Metadata = {
  metadataBase: new URL(ARMOR_ORIGIN),
  title: {
    default: "丝瓜：铁皮大饭堂",
    template: "%s｜丝瓜：铁皮大饭堂",
  },
  description:
    "《战术小队》国际版载具百科、武器资料与交互式防护分析。",
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      style={VEHICLE_MODEL_CATEGORY_CSS_VARIABLES as CSSProperties}
    >
      <body>
        <DailyActiveProvider>{children}</DailyActiveProvider>
      </body>
    </html>
  );
}
