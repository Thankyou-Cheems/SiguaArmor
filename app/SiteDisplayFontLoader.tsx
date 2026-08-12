"use client";

import { useEffect } from "react";

export const SITE_DISPLAY_FONT_STYLESHEET =
  "https://fontsapi.zeoseven.com/18/main/result.css";

const LINK_ID = "site-display-font-stylesheet";

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function SiteDisplayFontLoader() {
  useEffect(() => {
    const idleWindow = window as IdleWindow;
    const root = document.documentElement;
    let timeoutHandle: number | undefined;
    let idleHandle: number | undefined;
    let disposed = false;

    const loadFont = () => {
      if (disposed) return;
      const existing = document.getElementById(LINK_ID) as HTMLLinkElement | null;
      if (existing) return;

      root.dataset.displayFontState = "loading";
      const link = document.createElement("link");
      link.id = LINK_ID;
      link.rel = "stylesheet";
      link.href = SITE_DISPLAY_FONT_STYLESHEET;
      link.referrerPolicy = "no-referrer";
      link.addEventListener("load", () => {
        root.dataset.displayFontState = "ready";
      }, { once: true });
      link.addEventListener("error", () => {
        root.dataset.displayFontState = "fallback";
      }, { once: true });
      document.head.append(link);
    };

    const scheduleFont = () => {
      root.dataset.displayFontState = "scheduled";
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(loadFont, { timeout: 2_500 });
      } else {
        timeoutHandle = window.setTimeout(loadFont, 1_000);
      }
    };

    if (document.readyState === "complete") {
      scheduleFont();
    } else {
      window.addEventListener("load", scheduleFont, { once: true });
    }

    return () => {
      disposed = true;
      window.removeEventListener("load", scheduleFont);
      if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
    };
  }, []);

  return null;
}
