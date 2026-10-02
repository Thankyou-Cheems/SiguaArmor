"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createSiteI18n, normalizeSiteLanguage, resolveSiteLanguage, SITE_LANGUAGE_STORAGE_KEY, type SiteI18n, type SiteLanguage, type SiteNamespace } from "../lib/site-i18n";

const SiteLanguageContext = createContext<SiteI18n | null>(null);
const serverSnapshot = () => 0;

export function SiteLanguageProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(createSiteI18n);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY); } catch { /* Storage is optional. */ }
    const language = resolveSiteLanguage(saved, navigator.languages ?? [navigator.language]);
    const apply = async (next: SiteLanguage) => {
      try {
        if (await controller.changeLanguage(next)) document.documentElement.lang = next;
      } catch { /* Keep the usable Chinese fallback if a language chunk is offline. */ }
    };
    void apply(language);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SITE_LANGUAGE_STORAGE_KEY) return;
      const next = normalizeSiteLanguage(event.newValue);
      if (next) void apply(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [controller]);
  return <SiteLanguageContext.Provider value={controller}>{children}</SiteLanguageContext.Provider>;
}

export type SiteTranslate = (key: string, options?: Record<string, string | number>) => string;

export function useSiteTranslation(namespace: SiteNamespace = "common") {
  const controller = useContext(SiteLanguageContext);
  if (!controller) throw new Error("SiteLanguageProvider is required");
  const revision = useSyncExternalStore(controller.subscribe, controller.snapshot, serverSnapshot);
  useEffect(() => {
    void controller.namespace(namespace).catch(() => undefined);
  }, [controller, namespace]);
  const language = controller.instance.language as SiteLanguage;
  const t = useMemo<SiteTranslate>(() => {
    void revision; // Resource availability can change without changing the locale.
    const fixed = controller.instance.getFixedT(language, namespace);
    return (key, options) => fixed(key, options) as string;
  }, [controller, language, namespace, revision]);
  const changeLanguage = useCallback(async (next: SiteLanguage) => {
    if (!await controller.changeLanguage(next)) return;
    document.documentElement.lang = next;
    try { localStorage.setItem(SITE_LANGUAGE_STORAGE_KEY, next); } catch { /* Storage is optional. */ }
  }, [controller]);
  return { t, language, changeLanguage };
}
