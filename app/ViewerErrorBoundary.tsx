"use client";

import { Component, Fragment, type ReactNode } from "react";

interface ViewerErrorBoundaryProps {
  children: ReactNode;
  vehicleName?: string;
  // React.lazy caches a rejected module. Its outer boundary must reload the
  // document; a mounted renderer's inner boundary can retry by remounting.
  retryMode?: "remount" | "reload";
  onClose?: () => void;
  onOpenReference?: () => void;
}

// Only this subtree is replaced. Catalog navigation and reference data stay mounted.
export class ViewerErrorBoundary extends Component<
  ViewerErrorBoundaryProps,
  { error: Error | null; attempt: number }
> {
  state = { error: null as Error | null, attempt: 0 };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  render() {
    if (!this.state.error) {
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    }
    const reloadPage = this.props.retryMode === "reload";
    return (
      <div className="vehicle-viewer vehicle-viewer--error" data-viewer-state="unavailable" data-viewer-retry={reloadPage ? "reload" : "remount"} role="alert">
        <strong>{this.props.vehicleName ? `${this.props.vehicleName} · ` : ""}3D 预览暂时不可用</strong>
        <span>{reloadPage
          ? "3D 组件未能启动。请刷新当前页面重新加载，或继续使用目录与载具资料。"
          : "3D 渲染已停止。你可以手动重试，或继续使用页面导航与载具资料。"}</span>
        <div>
          <button type="button" onClick={() => {
            if (reloadPage) window.location.reload();
            else this.setState(({ attempt }) => ({ error: null, attempt: attempt + 1 }));
          }}>
            {reloadPage ? "刷新页面重试" : "重试 3D 预览"}
          </button>
          {this.props.onOpenReference ? <button type="button" onClick={this.props.onOpenReference}>查看载具资料</button> : null}
          {this.props.onClose ? <button type="button" onClick={this.props.onClose}>返回目录</button> : null}
        </div>
        <details><summary>错误信息</summary><span>{this.state.error.message}</span></details>
      </div>
    );
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
