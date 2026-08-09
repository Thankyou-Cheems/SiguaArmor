import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");
const releasePublicRoot = path.join(root, ".release", "public");
const distClientRoot = path.join(root, "dist", "client");
const listenPort = Number(process.argv[2] ?? 4318);
const upstreamPort = Number(process.argv[3] ?? 4317);
if (
  !Number.isInteger(listenPort) ||
  listenPort < 1024 ||
  listenPort > 65535 ||
  !Number.isInteger(upstreamPort) ||
  upstreamPort < 1024 ||
  upstreamPort > 65535
) {
  throw new Error("QA proxy ports must be integers between 1024 and 65535");
}

const contentTypes = new Map([
  [".bin", "application/octet-stream"],
  [".css", "text/css; charset=utf-8"],
  [".glb", "model/gltf-binary"],
  [".gltf", "model/gltf+json"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

const releasePublicPrefixes = [
  "/assets/runtime-probe/models/",
  "/assets/runtime-probe/blob/",
  "/assets/runtime-probe/hit-runtime/",
  "/catalog-data/",
  "/fonts/",
  "/icons/",
  "/images/faction-art/",
  "/images/faction-bg/",
  "/images/game-ui/vehicle-categories/",
  "/images/site/",
  "/images/vehicle-impressions/",
];

const sourcePublicPrefixes = [
  "/assets/runtime-probe/visuals/",
  "/infantry-hit-runtime/models/",
];

const releasePublicFiles = new Set(["/supporters.json", "/updates.json"]);
const releasePublicAliases = new Map([
  ["/squad/updates.json", "/updates.json"],
]);

function staticPublicPath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://127.0.0.1").pathname);
  const releasePathname = releasePublicAliases.get(pathname) ?? pathname;
  const staticRoot =
    releasePublicFiles.has(releasePathname) ||
    releasePublicPrefixes.some((prefix) =>
      releasePathname.startsWith(prefix),
    )
    ? releasePublicRoot
    : sourcePublicPrefixes.some((prefix) => pathname.startsWith(prefix))
      ? publicRoot
      : pathname.startsWith("/assets/")
        ? distClientRoot
        : null;
  if (!staticRoot) return null;
  const candidate = path.resolve(staticRoot, `.${releasePathname}`);
  if (!candidate.startsWith(`${staticRoot}${path.sep}`)) {
    throw new Error(`QA static path escapes public root: ${pathname}`);
  }
  return candidate;
}

const server = http.createServer(async (request, response) => {
  try {
    const staticPath = staticPublicPath(request.url ?? "/");
    if (staticPath) {
      const metadata = await stat(staticPath);
      if (!metadata.isFile()) throw new Error(`QA static source is not a file`);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": metadata.size,
        "Content-Type":
          contentTypes.get(path.extname(staticPath).toLowerCase()) ??
          "application/octet-stream",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(staticPath).pipe(response);
      return;
    }

    const upstreamRequest = http.request(
      {
        hostname: "127.0.0.1",
        port: upstreamPort,
        path: request.url,
        method: request.method,
        headers: {
          ...request.headers,
          host: `127.0.0.1:${upstreamPort}`,
        },
      },
      (upstreamResponse) => {
        if ((upstreamResponse.statusCode ?? 502) >= 400) {
          process.stdout.write(
            `${JSON.stringify({
              event: "runtime-viewer-qa-upstream-error",
              path: request.url,
              status: upstreamResponse.statusCode ?? 502,
            })}\n`,
          );
        }
        response.writeHead(
          upstreamResponse.statusCode ?? 502,
          upstreamResponse.headers,
        );
        upstreamResponse.pipe(response);
      },
    );
    upstreamRequest.on("error", (error) => {
      response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`QA upstream failed: ${error.message}`);
    });
    request.pipe(upstreamRequest);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        event: "runtime-viewer-qa-static-error",
        path: request.url,
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`QA static file failed: ${error.message}`);
  }
});

server.listen(listenPort, "127.0.0.1", () => {
  process.stdout.write(
    `${JSON.stringify({
      event: "runtime-viewer-qa-proxy-ready",
      listenUrl: `http://127.0.0.1:${listenPort}`,
      upstreamUrl: `http://127.0.0.1:${upstreamPort}`,
      staticPublicRoot: publicRoot,
      staticClientRoot: distClientRoot,
    })}\n`,
  );
});
