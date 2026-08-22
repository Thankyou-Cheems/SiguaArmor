"use client";

import { useEffect, useState } from "react";

import { RuntimeVehicleViewer } from "./RuntimeVehicleViewer";
import type { ReferenceData } from "./catalog-types";
import type { RuntimeVehiclePreview } from "./runtime-probe-preview-data";
import {
  runtimePreviewForVariant,
} from "./runtime-probe-preview-data";
import { referenceDataForWikiVehicleBinding } from "./wiki-vehicle-catalog";
import { loadWikiVehicleFactionMechanics } from "../lib/wiki-source";
import { wikiVehicleFactionId } from "../lib/wiki-vehicle-identity";

type ViewerRouteState =
  | { kind: "loading" }
  | {
      kind: "ready";
      preview: RuntimeVehiclePreview;
      referenceData: ReferenceData;
    }
  | { kind: "error"; message: string };

export function RuntimeViewerOnlyPage() {
  const [state, setState] = useState<ViewerRouteState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const cardId = params.get("cardId");
    const rawName = params.get("rawName");

    if (!cardId || !rawName) {
      setState({
        kind: "error",
        message: "viewer-only requires exact cardId and rawName",
      });
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const [preview, mechanics] = await Promise.all([
        runtimePreviewForVariant(cardId, rawName),
        loadWikiVehicleFactionMechanics(wikiVehicleFactionId(cardId)),
      ]);
      if (cancelled) return;
      if (!preview?.visual) {
        setState({
          kind: "error",
          message: `No exact runtime visual descriptor for ${cardId} / ${rawName}`,
        });
        return;
      }
      const referenceData = referenceDataForWikiVehicleBinding(
        mechanics,
        cardId,
        rawName,
      );
      setState({ kind: "ready", preview, referenceData });
    })().catch((error: unknown) => {
      if (cancelled) return;
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Runtime visual descriptor load failed",
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      className="runtime-viewer-only"
      data-viewer-only="true"
      data-viewer-route-state={state.kind}
    >
      {state.kind === "ready" ? (
        <RuntimeVehicleViewer
          preview={state.preview}
          referenceData={state.referenceData}
          showChrome={false}
        />
      ) : null}
      {state.kind === "error" ? (
        <div className="runtime-viewer-only__error" role="alert">
          {state.message}
        </div>
      ) : null}
    </main>
  );
}
