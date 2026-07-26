"use client";

import { useEffect } from "react";
import { runtimePreviewForVariant } from "./runtime-probe-preview-data";
import { RuntimeVehicleViewer } from "./RuntimeVehicleViewer";
import { officialVehiclePreviewIssue } from "./vehicle-preview-policy";
import type { SiteEdition } from "./site-edition";
import type { ViewerAssetMode, ViewerNavigationState } from "./viewer-types";

interface TextureVariantOption {
  id: string;
  rawName: string;
  label: string;
  displayName: string;
}

interface InternationalVehicleViewerProps {
  siteEdition: SiteEdition;
  cardId: string;
  rawName: string;
  displayName: string;
  textureVariants?: TextureVariantOption[];
  onTextureVariantChange?: (variantId: string) => void;
  onClose?: () => void;
  navigationState: ViewerNavigationState;
  onNavigationStateChange: (state: ViewerNavigationState) => void;
}

function initialMode(state: ViewerNavigationState): ViewerAssetMode {
  return state.view;
}

export default function InternationalVehicleViewer({
  siteEdition,
  cardId,
  rawName,
  displayName,
  textureVariants = [],
  onTextureVariantChange,
  onClose,
  navigationState,
  onNavigationStateChange,
}: InternationalVehicleViewerProps) {
  const preview = runtimePreviewForVariant(cardId, rawName, siteEdition);
  const requestedMode = initialMode(navigationState);
  const previewIssue = officialVehiclePreviewIssue(rawName);
  const mode = previewIssue && requestedMode === "exterior" ? "armor" : requestedMode;

  useEffect(() => {
    if (!previewIssue || requestedMode !== "exterior") return;
    onNavigationStateChange({ ...navigationState, view: "armor" });
  }, [navigationState, onNavigationStateChange, previewIssue, requestedMode]);

  if (!preview?.visual) {
    return (
      <div className="vehicle-viewer vehicle-viewer--error" role="status">
        <strong>3D 研究预览当前不可用</strong>
        <span>{rawName ? `尚未找到 ${rawName} 的可用运行时视觉包。` : "当前卡片缺少变体身份。"}</span>
        {onClose ? (
          <button className="viewer-close" type="button" onClick={onClose} aria-label="关闭载具详情">
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
    );
  }

  const visual = preview.visual;
  const selectMode = (nextMode: ViewerAssetMode) => {
    onNavigationStateChange({ ...navigationState, view: nextMode });
  };

  return (
    <div
      className="vehicle-viewer international-vehicle-viewer"
      data-render-mode={mode}
      data-site-edition={siteEdition}
      data-card-id={cardId}
      data-variant-raw-name={rawName}
      data-package-sha256={visual.packageSha256}
      data-hit-access={preview.hit?.status ?? "absent"}
      data-official-preview-issue={previewIssue?.code}
      data-has-texture-variants={!previewIssue && textureVariants.length > 1 ? "true" : undefined}
    >
      <RuntimeVehicleViewer
        preview={preview}
        showChrome={false}
        mode={mode}
        displayName={displayName}
        onModeChange={selectMode}
        onClose={onClose}
        navigationState={navigationState}
        onNavigationStateChange={onNavigationStateChange}
      />
      {!previewIssue && mode === "exterior" && textureVariants.length > 1 && onTextureVariantChange ? (
        <nav className="viewer-texture-variant-switcher" aria-label="切换外观贴图变体">
          <span>贴图变体</span>
          <div role="group" aria-label={`${displayName}贴图变体`}>
            {textureVariants.map((variant) => {
              const selected = variant.rawName === rawName;
              return (
                <button
                  key={variant.id}
                  type="button"
                  data-active={selected}
                  aria-pressed={selected}
                  aria-label={`切换到${variant.displayName}`}
                  title={variant.displayName}
                  onClick={() => {
                    if (!selected) onTextureVariantChange(variant.id);
                  }}
                >
                  {variant.label}
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
