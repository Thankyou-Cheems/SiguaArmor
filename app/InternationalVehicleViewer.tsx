"use client";

import { useEffect, useMemo, useState } from "react";
import {
  runtimePreviewForCatalogBinding,
  type RuntimeVehiclePreview,
} from "./runtime-probe-preview-data";
import { RuntimeVehicleViewer } from "./RuntimeVehicleViewer";
import { previewSelectionKey, vehicleExteriorCapability, type ExteriorCapability } from "./vehicle-preview-policy";
import type { ReferenceData } from "./catalog-types";
import type { SiteEdition } from "./site-edition";
import type { ViewerAssetMode, ViewerNavigationState } from "./viewer-types";
import type { RuntimeAttackSourcePresentation } from "./runtime-wiki-attack-source";

interface TextureVariantOption {
  id: string;
  rawName: string;
  label: string;
  displayName: string;
}

interface TextureStreamingState {
  loaded: number;
  total: number;
}

interface InternationalVehicleViewerProps {
  siteEdition: SiteEdition;
  cardId: string;
  rawName: string;
  runtimeVehicleRef: string | null;
  visualArtifactRef: string | null;
  displayName: string;
  attackSourcePresentation: RuntimeAttackSourcePresentation;
  referenceData: ReferenceData | null;
  textureVariants?: TextureVariantOption[];
  onTextureVariantChange?: (variantId: string) => void;
  onClose?: () => void;
  onOpenReference?: () => void;
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
  runtimeVehicleRef,
  visualArtifactRef,
  displayName,
  attackSourcePresentation,
  referenceData,
  textureVariants = [],
  onTextureVariantChange,
  onClose,
  onOpenReference,
  navigationState,
  onNavigationStateChange,
}: InternationalVehicleViewerProps) {
  const requestedMode = initialMode(navigationState);
  const selectionKey = previewSelectionKey({ edition: siteEdition, cardId, rawName, runtimeVehicleRef, visualArtifactRef });
  const [resolved, setResolved] = useState<{ key: string; preview: RuntimeVehiclePreview | null; error: string | null } | null>(null);
  const [exterior, setExterior] = useState<{ key: string; capability: ExteriorCapability } | null>(null);
  const preview = resolved?.key === selectionKey ? resolved.preview : null;
  const previewLoadError = resolved?.key === selectionKey ? resolved.error : null;
  const capability = vehicleExteriorCapability(Boolean(runtimeVehicleRef && visualArtifactRef),
    previewLoadError ? { state: "unavailable", message: previewLoadError }
      : exterior?.key === selectionKey ? exterior.capability : { state: "pending" });
  const previewIssue = capability.state === "unavailable" ? capability : null;
  const mode = previewIssue && requestedMode === "exterior" ? "armor" : requestedMode;
  const [textureStreaming, setTextureStreaming] = useState<TextureStreamingState | null>(null);
  const {
    cardId: attackSourceCardId,
    canonicalRawName: attackSourceCanonicalRawName,
    displayName: attackSourceDisplayName,
    groupId: attackSourceGroupId,
    groupName: attackSourceGroupName,
    groupOrder: attackSourceGroupOrder,
    type: attackSourceType,
  } = attackSourcePresentation;
  const stableAttackSourcePresentation = useMemo(
    () => ({
      cardId: attackSourceCardId,
      canonicalRawName: attackSourceCanonicalRawName,
      displayName: attackSourceDisplayName,
      groupId: attackSourceGroupId,
      groupName: attackSourceGroupName,
      groupOrder: attackSourceGroupOrder,
      type: attackSourceType,
    }),
    [
      attackSourceCanonicalRawName,
      attackSourceCardId,
      attackSourceDisplayName,
      attackSourceGroupId,
      attackSourceGroupName,
      attackSourceGroupOrder,
      attackSourceType,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    setResolved(null);
    setTextureStreaming(null);
    void runtimePreviewForCatalogBinding(
      cardId,
      rawName,
      runtimeVehicleRef,
      visualArtifactRef,
      siteEdition,
    )
      .then((nextPreview) => {
        if (cancelled) return;
        setResolved({ key: selectionKey, preview: nextPreview, error: nextPreview ? null
          : rawName ? `尚未找到 ${rawName} 的可用运行时视觉包。` : "当前卡片缺少变体身份。" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResolved({ key: selectionKey, preview: null, error: error instanceof Error ? error.message : "运行时视觉包加载失败。" });
      });
    return () => {
      cancelled = true;
    };
  }, [cardId, rawName, runtimeVehicleRef, selectionKey, siteEdition, visualArtifactRef]);

  useEffect(() => {
    if (!previewIssue || requestedMode !== "exterior") return;
    onNavigationStateChange({ ...navigationState, view: "armor" });
  }, [navigationState, onNavigationStateChange, previewIssue, requestedMode]);

  if (!preview || !preview.visual) {
    return (
      <div
        className={`vehicle-viewer vehicle-viewer--${previewLoadError ? "error" : "loading"}`}
        role="status"
        aria-busy={!previewLoadError}
      >
        <strong>{previewLoadError ? "3D 研究预览当前不可用" : "正在加载 3D 研究预览"}</strong>
        <span>{previewLoadError ?? "正在按当前载具身份载入视觉包。"}</span>
        {onClose ? (
          <button className="viewer-close" type="button" onClick={onClose} aria-label="关闭载具详情">
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
    );
  }

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
      data-runtime-vehicle-ref={runtimeVehicleRef ?? undefined}
      data-visual-artifact-ref={visualArtifactRef ?? undefined}
      data-hit-access={preview.hit?.status ?? preview.hitAvailability?.status ?? "absent"}
      data-exterior-capability={capability.state}
      data-has-texture-variants={textureVariants.length > 1 ? "true" : undefined}
      data-texture-streaming={textureStreaming ? "true" : "false"}
    >
      <div className="international-vehicle-viewer__stage">
        {textureStreaming ? (
          <div
            className="viewer-texture-streaming"
            role="status"
            aria-live="polite"
            aria-label={`外观贴图载入中，${textureStreaming.loaded} / ${textureStreaming.total} 源资产，已完成部分将直接显示`}
          >
            <span className="viewer-texture-streaming__signal" aria-hidden="true"><i /></span>
            <span>
              <strong>外观贴图载入中</strong>
              <small>{textureStreaming.loaded} / {textureStreaming.total}</small>
            </span>
          </div>
        ) : null}
        <RuntimeVehicleViewer
          key={selectionKey}
          preview={preview}
          showChrome={false}
          mode={mode}
          displayName={displayName}
          attackSourcePresentation={stableAttackSourcePresentation}
          referenceData={referenceData}
          onModeChange={selectMode}
          onClose={onClose}
          onOpenReference={onOpenReference}
          navigationState={navigationState}
          onNavigationStateChange={onNavigationStateChange}
          onExteriorStreamingChange={setTextureStreaming}
          onExteriorCapabilityChange={(next) => setExterior({ key: selectionKey, capability: next })}
        />
        {(mode === "exterior" || previewIssue) && textureVariants.length > 1 && onTextureVariantChange ? (
          <nav className="viewer-texture-variant-switcher" aria-label="选择外观">
            <span>选择外观</span>
            <div role="group" aria-label={`${displayName}外观选择`}>
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
    </div>
  );
}
