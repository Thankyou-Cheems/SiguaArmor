import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  evaluateRuntimeViewerBudget,
  summarizeFrameIntervals,
} from "./runtime-viewer-metrics.mjs";

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith("--") || argv[index + 1] === undefined) {
      throw new Error(`Expected --name value, received ${key ?? "end of arguments"}`);
    }
    args.set(key.slice(2), argv[index + 1]);
  }
  const number = (name, fallback) => Number(args.get(name) ?? fallback);
  return {
    port: number("port", 0),
    url: args.get("url"),
    output: args.get("output"),
    budget: {
      expectedRenderer: args.get("expected-renderer") ?? "Intel.*UHD.*770",
      minCompatibilityAssets: number("min-compatibility-assets", 8),
      maxReadyMs: number("max-ready-ms", 20_000),
      maxDragP95Ms: number("max-drag-p95-ms", 34),
      maxDragMaxMs: number("max-drag-max-ms", 100),
      maxLongTasks: number("max-long-tasks", 1),
      maxContextLosses: number("max-context-losses", 0),
    },
  };
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async ready() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) {
        listener(message.params ?? {});
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() {
    this.socket.close();
  }
}

async function waitFor(predicate, timeoutMs, label) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

function valueOf(evaluation) {
  if (evaluation.exceptionDetails) {
    throw new Error(
      evaluation.exceptionDetails.exception?.description
        ?? evaluation.exceptionDetails.text
        ?? "Runtime.evaluate failed",
    );
  }
  return evaluation.result?.value;
}

const args = parseArgs(process.argv.slice(2));
if (!args.port || !args.url || !args.output) {
  throw new Error("--port, --url, and --output are required");
}

const base = `http://127.0.0.1:${args.port}`;
const version = await (await fetch(`${base}/json/version`)).json();
const browser = new CdpClient(version.webSocketDebuggerUrl);
await browser.ready();
const systemInfo = await browser.send("SystemInfo.getInfo");
const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
const target = await waitFor(async () => {
  const targets = await (await fetch(`${base}/json/list`)).json();
  return targets.find((candidate) => candidate.id === targetId && candidate.webSocketDebuggerUrl);
}, 5_000, "CDP page target");
const page = new CdpClient(target.webSocketDebuggerUrl);
await page.ready();

const requests = new Map();
const failures = [];
const consoleErrors = [];
page.on("Network.requestWillBeSent", ({ requestId, request, type }) => {
  requests.set(requestId, { url: request.url, type, bytes: 0 });
});
page.on("Network.loadingFinished", ({ requestId, encodedDataLength }) => {
  const request = requests.get(requestId);
  if (request) request.bytes = encodedDataLength;
});
page.on("Network.loadingFailed", ({ requestId, errorText, canceled }) => {
  const request = requests.get(requestId);
  if (!canceled) failures.push({ url: request?.url ?? requestId, errorText });
});
page.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
  consoleErrors.push(exceptionDetails.exception?.description ?? exceptionDetails.text);
});
page.on("Log.entryAdded", ({ entry }) => {
  if (entry.level === "error") {
    consoleErrors.push(`${entry.source}: ${entry.text}${entry.url ? ` (${entry.url})` : ""}`);
  }
});

await Promise.all([
  page.send("Page.enable"),
  page.send("Runtime.enable"),
  page.send("Network.enable"),
  page.send("Log.enable"),
  page.send("Performance.enable"),
  page.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  }),
]);
await page.send("Network.clearBrowserCache");
await page.send("Network.setCacheDisabled", { cacheDisabled: true });
requests.clear();
const navigationStartedAt = performance.now();
await page.send("Page.navigate", { url: args.url });

const readViewerState = async () => {
  const evaluation = await page.send("Runtime.evaluate", {
    expression: `(() => {
      const host = document.querySelector('.runtime-vehicle-viewer__host');
      if (!host) return {
        missing: true,
        title: document.title,
        url: location.href,
        readyState: document.readyState,
        bodyText: document.body?.innerText?.slice(0, 500) ?? null,
      };
      return {
        dataset: Object.fromEntries(Object.entries(host.dataset)),
        canvasCount: host.querySelectorAll('canvas').length,
      };
    })()`,
    returnByValue: true,
  });
  return valueOf(evaluation);
};
let viewer;
try {
  viewer = await waitFor(async () => {
    const state = await readViewerState();
    return state?.dataset?.viewerInitialFitState === "ready" && state?.dataset?.exteriorAssetState === "ready"
      ? { ...state.dataset, canvasCount: state.canvasCount }
      : null;
  }, args.budget.maxReadyMs + 5_000, "runtime viewer exterior readiness");
} catch (error) {
  const state = await readViewerState();
  throw new Error(`${error.message}; current state: ${JSON.stringify(state)}; errors: ${JSON.stringify(consoleErrors)}`);
}
const readyMs = performance.now() - navigationStartedAt;

const pageRenderer = valueOf(await page.send("Runtime.evaluate", {
  expression: `(() => {
    const canvas = document.querySelector('.runtime-vehicle-viewer__host canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!gl) return null;
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null;
  })()`,
  returnByValue: true,
}));

await page.send("Runtime.evaluate", {
  expression: `(() => {
    const canvas = document.querySelector('.runtime-vehicle-viewer__host canvas');
    window.__siguaIgpuProbe = { intervals: [], longTasks: [], contextLosses: 0, active: true, startedAt: performance.now() };
    let previous = performance.now();
    const tick = (now) => {
      if (!window.__siguaIgpuProbe?.active) return;
      window.__siguaIgpuProbe.intervals.push(now - previous);
      previous = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__siguaIgpuLongTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__siguaIgpuProbe.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }
    });
    try { window.__siguaIgpuLongTaskObserver.observe({ type: 'longtask' }); } catch {}
    canvas.addEventListener('webglcontextlost', () => { window.__siguaIgpuProbe.contextLosses += 1; });
  })()`,
});
const rect = valueOf(await page.send("Runtime.evaluate", {
  expression: `(() => {
    const rect = document.querySelector('.runtime-vehicle-viewer__host canvas').getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })()`,
  returnByValue: true,
}));
const startX = rect.x + rect.width * 0.48;
const startY = rect.y + rect.height * 0.48;
await page.send("Input.dispatchMouseEvent", {
  type: "mousePressed", x: startX, y: startY, button: "left", buttons: 1, clickCount: 1,
});
const dragStartedAt = performance.now();
for (let index = 1; index <= 120; index += 1) {
  const phase = index / 120;
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: startX + Math.sin(phase * Math.PI * 2) * Math.min(rect.width * 0.22, 220),
    y: startY + Math.sin(phase * Math.PI * 4) * Math.min(rect.height * 0.08, 60),
    button: "left",
    buttons: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 12));
}
await page.send("Input.dispatchMouseEvent", {
  type: "mouseReleased", x: startX, y: startY, button: "left", buttons: 0, clickCount: 1,
});
const dragDurationMs = performance.now() - dragStartedAt;
await new Promise((resolve) => setTimeout(resolve, 300));
const dragRaw = valueOf(await page.send("Runtime.evaluate", {
  expression: `(() => {
    window.__siguaIgpuProbe.active = false;
    window.__siguaIgpuLongTaskObserver?.disconnect();
    return window.__siguaIgpuProbe;
  })()`,
  returnByValue: true,
}));

const glRenderer = systemInfo.gpu?.auxAttributes?.glRenderer ?? null;
const ignoredConsoleErrorPatterns = [
  /\/favicon\.ico\)$/u,
  /\/__analytics\/dau\)$/u,
  /\/squad\/updates\.json\)$/u,
];
const actionableConsoleErrors = [...new Set(consoleErrors)].filter(
  (error) => !ignoredConsoleErrorPatterns.some((pattern) => pattern.test(error)),
);
const report = {
  schemaVersion: "sigua-runtime-viewer-igpu-probe/v1",
  capturedAt: new Date().toISOString(),
  url: args.url,
  browser: {
    product: version.Browser,
    userAgent: version["User-Agent"],
    glRenderer,
    pageRenderer,
    gpuDevices: systemInfo.gpu?.devices ?? [],
  },
  readyMs,
  viewer: {
    renderQuality: viewer.renderQuality,
    renderQualityReason: viewer.renderQualityReason,
    renderPixelRatio: Number(viewer.renderPixelRatio),
    assetLoadConcurrency: Number(viewer.assetLoadConcurrency),
    textureMipmaps: viewer.textureMipmaps,
    exteriorAssetState: viewer.exteriorAssetState,
    exteriorLoadedAssetCount: Number(viewer.exteriorLoadedAssetCount),
    exteriorLoadedOccurrenceCount: Number(viewer.exteriorLoadedOccurrenceCount),
    compatibilityAssetCount: Number(viewer.exteriorCompatibilityAssetCount),
    uniqueTextureCount: Number(viewer.exteriorUniqueTextureCount),
    reusedTextureCount: Number(viewer.exteriorReusedTextureCount),
    canvasCount: Number(viewer.canvasCount),
  },
  drag: {
    durationMs: dragDurationMs,
    frames: summarizeFrameIntervals(dragRaw.intervals.slice(2)),
    longTasks: dragRaw.longTasks.filter((task) => task.startTime >= navigationStartedAt),
    contextLosses: dragRaw.contextLosses,
  },
  network: {
    encodedBytes: [...requests.values()].reduce((sum, request) => sum + request.bytes, 0),
    requestCount: requests.size,
    failures,
    forbiddenCatalogRequests: [...requests.values()]
      .map(({ url }) => url)
      .filter((url) => /\/data\/(?:weapons|vehicles)\/catalog\.json(?:\?|$)/u.test(url)),
    largestRequests: [...requests.values()]
      .sort((left, right) => right.bytes - left.bytes)
      .slice(0, 20),
  },
  consoleErrors: actionableConsoleErrors,
  ignoredConsoleErrors: [...new Set(consoleErrors)].filter(
    (error) => !actionableConsoleErrors.includes(error),
  ),
};
report.budget = { ...args.budget, ...evaluateRuntimeViewerBudget(report, args.budget) };
await mkdir(path.dirname(path.resolve(args.output)), { recursive: true });
await writeFile(path.resolve(args.output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
page.close();
browser.close();
if (!report.budget.pass) process.exitCode = 1;
