import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createBrotliCompress, createGzip } from "node:zlib";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

// Development-only, read-only adapter. Never publishes the private map service
// and never copies a map payload into the product checkout.
export function schoolResourceFile(pathname, displayRoot, wikiRoot) {
  if (pathname === "/data/maps/narva/fixed-display.json" ||
      /^\/assets\/maps\/narva\/fixed-display\/[a-f0-9]{64}\.sgfd$/u.test(pathname)) {
    return resolve(displayRoot, `.${pathname}`);
  }
  if (pathname === "/data/maps/narva/infantry-scene.json" ||
      pathname === "/algorithms/maps/fixed-display-format.js" ||
      /^\/assets\/maps\/narva\/infantry-scene\/assets\/query\/(geometry|bvh)\/[a-f0-9]{64}\.bin$/u.test(pathname) ||
      /^\/assets\/maps\/narva\/infantry-scene\/assets\/terrain\/[a-f0-9]{64}\.sgnt$/u.test(pathname)) {
    return resolve(wikiRoot, `.${pathname}`);
  }
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: {
    "display-root": { type: "string" }, "wiki-root": { type: "string" },
    port: { type: "string", default: "4191" },
  } });
  if (!values["display-root"] || !values["wiki-root"]) throw new Error("Supply --display-root and --wiki-root");
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const file = schoolResourceFile(pathname, values["display-root"], values["wiki-root"]);
    if (!file || !["GET", "HEAD"].includes(request.method)) { response.writeHead(404).end(); return; }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error("Not a file");
      const coding = request.headers["accept-encoding"]?.includes("br") ? "br"
        : request.headers["accept-encoding"]?.includes("gzip") ? "gzip" : null;
      response.writeHead(200, {
        "Content-Type": pathname.endsWith(".json") ? "application/json" : pathname.endsWith(".js")
          ? "text/javascript" : "application/octet-stream",
        "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff",
        "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        "Vary": "Accept-Encoding", ...(coding ? { "Content-Encoding": coding } : {}),
      });
      if (request.method === "HEAD") { response.end(); return; }
      if (coding) await pipeline(createReadStream(file), coding === "br" ? createBrotliCompress() : createGzip(), response);
      else await pipeline(createReadStream(file), response);
    } catch (error) {
      if (!response.headersSent) response.writeHead(404).end("Scene resource not available");
      else response.destroy(error);
    }
  });
  server.listen(Number(values.port), "127.0.0.1", () => console.log(`Narva school resources: http://127.0.0.1:${values.port}`));
}
