"use client";

import { useState } from "react";
import { SITE_LANGUAGES, type SiteLanguage } from "../lib/site-i18n";
import { useSiteTranslation } from "./SiteLanguageProvider";

const labels = { "zh-CN": "简体中文", "zh-Hant": "繁體中文", en: "English" };
export function SiteLanguageSwitcher() {
  const { t, language, changeLanguage } = useSiteTranslation();
  const [failed, setFailed] = useState(false);
  return (
    <span className="site-language-switcher">
      <select aria-label={t("language")} value={language} onChange={(event) => {
        setFailed(false);
        void changeLanguage(event.target.value as SiteLanguage).catch(() => setFailed(true));
      }}>
        {SITE_LANGUAGES.map((locale) => <option key={locale} value={locale} lang={locale}>{labels[locale]}</option>)}
      </select>
      {failed ? <span className="site-language-switcher__error" role="alert">{t("languageError")}</span> : null}
    </span>
  );
}
