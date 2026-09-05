import { createServer, request as upstreamRequest } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { startProdServer } from "vinext/server/prod-server";

// Mirror the production /squad prefix and static-file split on loopback.
// Vinext 0.0.50's Windows static cache uses backslashes as URL keys; serving
// the actual built client here also avoids patching an installed dependency.
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4188);
const serverPort = port + 1;
const clientRoot = resolve("dist/client");
const types = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg",
  ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain", ".html": "text/html" };
await startProdServer({ host, port: serverPort, outDir: resolve("dist") });
createServer(async (request, response) => {
  const url = new URL(request.url, `http://${host}`);
  const pathname = url.pathname.replace(/^\/squad(?=\/|$)/u, "") || "/";
  const file = resolve(clientRoot, `.${pathname}`);
  if (file.startsWith(clientRoot + sep) && !pathname.startsWith("/.vite/") &&
      !pathname.includes("\\") && ["GET", "HEAD"].includes(request.method)) {
    const info = await stat(file).catch(() => null);
    if (info?.isFile()) {
      response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream",
        "Content-Length": info.size, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
      if (request.method === "HEAD") response.end();
      else createReadStream(file).on("error", () => response.destroy()).pipe(response);
      return;
    }
  }
  const upstream = upstreamRequest({ host, port: serverPort, path: pathname + url.search,
    method: request.method, headers: request.headers }, (result) => {
    response.writeHead(result.statusCode, result.headers);
    result.on("error", () => response.destroy()).pipe(response);
  });
  upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
  request.on("error", () => upstream.destroy()).pipe(upstream);
}).listen(port, host, () => console.log(`Product preview: http://${host}:${port}/squad/`));
