"use client";

import { useEffect, useState } from "react";

import { RuntimeVehicleViewer } from "./RuntimeVehicleViewer";
import type { RuntimeVehiclePreview } from "./runtime-probe-preview-data";
import {
  runtimePreviewForVariant,
  runtimeReviewPreviewForVariant,
} from "./runtime-probe-preview-data";

type ViewerRouteState =
  | { kind: "loading" }
  | { kind: "ready"; preview: RuntimeVehiclePreview }
  | { kind: "error"; message: string };

function localReviewAllowed() {
  return (
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost"
  );
}

export function RuntimeViewerOnlyPage() {
  const [state, setState] = useState<ViewerRouteState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const cardId = params.get("cardId");
    const rawName = params.get("rawName");
    const packageSha256 = params.get("packageSha256");
    const review = params.get("review") === "1" && localReviewAllowed();

    if (!cardId || !rawName || !packageSha256) {
      setState({
        kind: "error",
        message: "viewer-only requires exact cardId, rawName, and packageSha256",
      });
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const preview = review
        ? await runtimeReviewPreviewForVariant(cardId, rawName)
        : await runtimePreviewForVariant(cardId, rawName);
      if (cancelled) return;
      if (!preview?.visual) {
        setState({
          kind: "error",
          message: `No exact runtime visual descriptor for ${cardId} / ${rawName}`,
        });
        return;
      }
      if (preview.visual.packageSha256 !== packageSha256) {
        setState({
          kind: "error",
          message: `Package hash mismatch: expected ${packageSha256}, got ${preview.visual.packageSha256}`,
        });
        return;
      }
      setState({ kind: "ready", preview });
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
        <RuntimeVehicleViewer preview={state.preview} showChrome={false} />
      ) : null}
      {state.kind === "error" ? (
        <div className="runtime-viewer-only__error" role="alert">
          {state.message}
        </div>
      ) : null}
    </main>
  );
}
