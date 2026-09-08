export type RuntimeViewerBackground = "school" | "grid";

const storageKey = "sigua-armor-viewer-background";
const listeners = new Set<() => void>();
let fallback: RuntimeViewerBackground = "school";

export function getRuntimeViewerBackground(): RuntimeViewerBackground {
  if (typeof window === "undefined") return "school";
  try {
    return window.localStorage.getItem(storageKey) === "grid" ? "grid" : "school";
  } catch {
    return fallback;
  }
}

export function setRuntimeViewerBackground(value: RuntimeViewerBackground) {
  fallback = value;
  try { window.localStorage.setItem(storageKey, value); } catch { /* Private storage may be unavailable. */ }
  listeners.forEach(listener => listener());
}

export function subscribeRuntimeViewerBackground(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function runtimeViewerBackgroundPresentation(background: RuntimeViewerBackground, operating: boolean) {
  return {
    schoolVisible: operating || background === "school",
    gridVisible: !operating && background === "grid",
    schoolMuted: !operating,
  };
}
