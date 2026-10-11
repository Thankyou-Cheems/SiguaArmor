"use client";

import { Component, Fragment, createRef, type ReactNode, type RefObject } from "react";
import { useSiteTranslation } from "./SiteLanguageProvider";

interface ViewerErrorBoundaryProps {
  children: ReactNode;
  vehicleName?: string;
  // React.lazy caches a rejected module. Its outer boundary must reload the
  // document; a mounted renderer's inner boundary can retry by remounting.
  retryMode?: "remount" | "reload";
  onClose?: () => void;
  onOpenReference?: () => void;
  // Resolve only this consumer's existing scene root, without adding wrapper DOM.
  getRetryFocusTarget?: () => HTMLElement | null;
}

export const VIEWER_CONTEXT_LOST = "VIEWER_CONTEXT_LOST";

function ViewerFailure({ error, vehicleName, retryMode, onClose, onOpenReference, onRetry, retryRef }: Omit<ViewerErrorBoundaryProps, "children"> & {
  error: Error;
  onRetry: (button: HTMLButtonElement) => void;
  retryRef: RefObject<HTMLButtonElement | null>;
}) {
  // Common is loaded before a language becomes active. A broken viewer/chunk
  // must not depend on fetching another namespace just to explain recovery.
  const { t } = useSiteTranslation("common");
  const reloadPage = retryMode === "reload";
  return (
    <div className="vehicle-viewer vehicle-viewer--error" data-viewer-state="unavailable" data-viewer-retry={reloadPage ? "reload" : "remount"}>
      <strong role="alert">{vehicleName ? `${vehicleName} · ` : ""}{t("viewerUnavailable")}</strong>
      <span>{t(reloadPage ? "viewerReloadHint" : "viewerRetryHint")}</span>
      <div>
        <button ref={retryRef} type="button" onClick={(event) => onRetry(event.currentTarget)}>
          {t(reloadPage ? "viewerReload" : "viewerRetry")}
        </button>
        {onOpenReference ? <button type="button" onClick={onOpenReference}>{t("viewerReference")}</button> : null}
        {onClose ? <button type="button" onClick={onClose}>{t("viewerCatalog")}</button> : null}
      </div>
      <details><summary>{t("errorDetails")}</summary><span>{error.message === VIEWER_CONTEXT_LOST ? t("viewerContextLost") : error.message}</span></details>
    </div>
  );
}

// Only this subtree is replaced. Catalog navigation and reference data stay mounted.
export class ViewerErrorBoundary extends Component<
  ViewerErrorBoundaryProps,
  { error: Error | null; attempt: number }
> {
  state = { error: null as Error | null, attempt: 0 };
  private retryRef = createRef<HTMLButtonElement>();
  private retryFocus: { source: HTMLElement; dispose: () => void } | null = null;

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch() {
    // A renderer can fail in its mount effect after the new root was committed.
    // Keep an explicit retry's focus on its replacement recovery button.
    this.restoreRetryFocus();
  }

  componentWillUnmount() {
    this.clearRetryFocus();
  }

  private clearRetryFocus = () => {
    this.retryFocus?.dispose();
    this.retryFocus = null;
  };

  private restoreRetryFocus = () => {
    const pending = this.retryFocus;
    if (!pending) return;
    const document = pending.source.ownerDocument;
    const active = document.activeElement;
    if (active !== pending.source && (pending.source.isConnected || (active && active !== document.body))) {
      this.clearRetryFocus();
      return;
    }
    const target = this.state.error ? this.retryRef.current : this.props.getRetryFocusTarget?.();
    if (!target?.isConnected || target.closest('[hidden], [inert], [aria-hidden="true"]')) {
      this.clearRetryFocus();
      return;
    }
    for (let element: HTMLElement | null = target; element; element = element.parentElement) {
      const style = document.defaultView?.getComputedStyle(element);
      if (style?.display === "none" || style?.visibility === "hidden" || style?.visibility === "collapse") {
        this.clearRetryFocus();
        return;
      }
    }
    pending.source = target;
    target.focus({ preventScroll: true });
  };

  private retry = (button: HTMLButtonElement) => {
    if (this.props.retryMode === "reload") {
      window.location.reload();
      return;
    }
    this.clearRetryFocus();
    const document = button.ownerDocument;
    if (document.activeElement === button) {
      // Ignore focus lost only because our old DOM is removed. Any deliberate
      // move elsewhere, including another viewer, cancels this recovery intent.
      const onFocus = (event: FocusEvent) => {
        if (event.target !== this.retryFocus?.source) this.clearRetryFocus();
      };
      document.addEventListener("focusin", onFocus);
      this.retryFocus = {
        source: button,
        dispose: () => document.removeEventListener("focusin", onFocus),
      };
    }
    this.setState(({ attempt }) => ({ error: null, attempt: attempt + 1 }), this.restoreRetryFocus);
  };

  render() {
    if (!this.state.error) {
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    }
    return <ViewerFailure {...this.props} error={this.state.error} onRetry={this.retry} retryRef={this.retryRef} />;
  }
}

// Register resources immediately after acquisition so an interrupted setup and a
// completed setup use the same idempotent teardown. One faulty disposer must not
// prevent the canvas, global listeners or renderer lease from being released.
export function createViewerCleanup() {
  const disposers: Array<() => void> = [];
  let disposed = false;
  const safelyDispose = (dispose: () => void) => {
    try {
      dispose();
    } catch (error) {
      console.error("3D viewer cleanup failed", error);
    }
  };
  return {
    add(dispose: () => void) {
      if (disposed) safelyDispose(dispose);
      else disposers.push(dispose);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const dispose of disposers.reverse()) safelyDispose(dispose);
      disposers.length = 0;
    },
  };
}
