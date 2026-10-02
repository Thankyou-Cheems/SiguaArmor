import { createInstance, type ResourceKey } from "i18next";
import common from "./locales/zh-CN/common.ts";
import catalog from "./locales/zh-CN/catalog.ts";
import viewer from "./locales/zh-CN/viewer.ts";

export const SITE_LANGUAGES = ["zh-CN", "zh-Hant", "en"] as const;
export type SiteLanguage = (typeof SITE_LANGUAGES)[number];
export type SiteNamespace = "common" | "catalog" | "viewer";
export const SITE_LANGUAGE_STORAGE_KEY = "sigua.ui-language";
const fallback = { common, catalog, viewer };
const loaders = {
  "zh-Hant": {
    common: () => import("./locales/zh-Hant/common.ts"),
    catalog: () => import("./locales/zh-Hant/catalog.ts"),
    viewer: () => import("./locales/zh-Hant/viewer.ts"),
  },
  en: {
    common: () => import("./locales/en/common.ts"),
    catalog: () => import("./locales/en/catalog.ts"),
    viewer: () => import("./locales/en/viewer.ts"),
  },
};

export function normalizeSiteLanguage(value: string | null | undefined): SiteLanguage | null {
  const language = value?.trim().replaceAll("_", "-").toLowerCase();
  if (!language) return null;
  if (language === "en" || language.startsWith("en-")) return "en";
  if (/^zh-(hant(?:-|$)|tw(?:-|$)|hk(?:-|$)|mo(?:-|$))/.test(language)) return "zh-Hant";
  if (language === "zh" || /^zh-(hans(?:-|$)|cn(?:-|$)|sg(?:-|$))/.test(language)) return "zh-CN";
  return null;
}

export function resolveSiteLanguage(saved: string | null, languages: readonly string[]): SiteLanguage {
  return normalizeSiteLanguage(saved)
    ?? languages.map(normalizeSiteLanguage).find((language) => language !== null)
    ?? "zh-CN";
}

/** Each mounted root owns one instance. SSR never reads browser preferences. */
export function createSiteI18n(load = async (language: SiteLanguage, namespace: SiteNamespace): Promise<ResourceKey> => {
  if (language === "zh-CN") return fallback[namespace];
  return (await loaders[language][namespace]()).default;
}) {
  const instance = createInstance();
  void instance.init({
    lng: "zh-CN", fallbackLng: "zh-CN", supportedLngs: [...SITE_LANGUAGES],
    load: "currentOnly", ns: ["common", "catalog", "viewer"], defaultNS: "common",
    resources: { "zh-CN": fallback }, initAsync: false,
    interpolation: { escapeValue: false }, returnNull: false,
  });
  const requested = new Set<SiteNamespace>(["common"]);
  const pending = new Map<string, Promise<void>>();
  let revision = 0;
  let version = 0;
  const listeners = new Set<() => void>();
  const notify = () => { version += 1; listeners.forEach((listener) => listener()); };
  async function ensure(language: SiteLanguage, namespace: SiteNamespace) {
    if (instance.hasResourceBundle(language, namespace)) return;
    const key = `${language}:${namespace}`;
    let request = pending.get(key);
    if (!request) {
      request = load(language, namespace).then((resources) => {
        instance.addResourceBundle(language, namespace, resources);
      }).finally(() => { pending.delete(key); });
      pending.set(key, request);
    }
    await request;
  }
  return {
    instance,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => version,
    async namespace(namespace: SiteNamespace) {
      requested.add(namespace);
      const language = instance.language as SiteLanguage;
      if (instance.hasResourceBundle(language, namespace)) return;
      await ensure(language, namespace);
      if (instance.language === language) notify();
    },
    async changeLanguage(language: SiteLanguage) {
      const requestRevision = ++revision;
      // A namespace may mount while a language chunk is being fetched.
      let size = 0;
      try {
        while (size !== requested.size) {
          size = requested.size;
          await Promise.all([...requested].map((namespace) => ensure(language, namespace)));
        }
      } catch (error) {
        if (requestRevision !== revision) return false;
        throw error;
      }
      if (requestRevision !== revision) return false;
      await instance.changeLanguage(language);
      notify();
      return requestRevision === revision;
    },
  };
}
export type SiteI18n = ReturnType<typeof createSiteI18n>;
