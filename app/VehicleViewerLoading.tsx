"use client";

import { useSiteTranslation } from "./SiteLanguageProvider";
interface VehicleViewerLoadingProps {
  vehicleName?: string;
  onClose?: () => void;
  embedded?: boolean;
}

export function VehicleViewerLoading({
  vehicleName,
  onClose,
  embedded = false,
}: VehicleViewerLoadingProps) {
  const { t } = useSiteTranslation("viewer");
  return (
    <div
      className={`vehicle-viewer vehicle-viewer--loading vehicle-viewer--data-loading${
        embedded ? " vehicle-viewer--data-loading-overlay" : ""
      }`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-embedded={embedded}
      aria-label={t("loadingData", { name: vehicleName ?? t("vehicle") })}
    >
      <div className="viewer-data-loader__ambient" aria-hidden="true" />
      <div className="viewer-data-loader__content">
        <div className="viewer-data-loader__visual" aria-hidden="true">
          <span className="viewer-data-loader__halo" />
          <span className="viewer-data-loader__wave-mask">
            <i className="viewer-data-loader__wave viewer-data-loader__wave--rear" />
            <i className="viewer-data-loader__wave viewer-data-loader__wave--front" />
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element -- shared transparent local derivative is also used by the help trigger */}
          <img src="/images/site/vehicle-crew-help.webp" alt="" />
          <span className="viewer-data-loader__scan" />
        </div>

        <div className="viewer-data-loader__copy">
          <span className="viewer-data-loader__eyebrow">
            <i aria-hidden="true" />
            {t("dataLink")}
          </span>
          <strong>{t("loading", { name: vehicleName || t("scene") })}</strong>
          <span>{t("receiving")}</span>
          <div className="viewer-data-loader__progress" aria-hidden="true">
            <i />
          </div>
          <small>{t("firstLoad")}</small>
        </div>
      </div>

      {onClose ? (
        <button className="viewer-close" type="button" onClick={onClose} aria-label={t("common:closeDetail")}>
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </div>
  );
}
