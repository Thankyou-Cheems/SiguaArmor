import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Offline layout fixture: exercise the production CSS without Wiki/analytics or
// a WebGL context. Run with CHROMIUM_PATH=/path/to/chromium when it is not on PATH.
// Alternatively: node tools/qa/verify-catalog-dock-layout.mjs --write-fixture fixture.html
// Open the self-contained fixture in a browser and inspect the #results JSON.
// This is a fixture for layout/hit testing, not a substitute for app navigation QA.
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtureOutput = process.argv[2] === "--write-fixture" ? process.argv[3] : null;
const styleFiles = ["globals.css", "site-language.css"];
const inlineStyles = fixtureOutput ? (await Promise.all(styleFiles.map((name) =>
  readFile(path.join(root, "app", name), "utf8")))).join("\n") : null;
const styles = fixtureOutput ? "" : styleFiles.map((name) =>
  `<link rel="stylesheet" href="${pathToFileURL(path.join(root, "app", name)).href}">`).join("");
const widths = [320, 390, 680, 681, 800, 1040, 1041, 1180, 1188, 1440, 1920];
const catalogs = Object.fromEntries(await Promise.all([
  ["international", "catalog-index.json"], ["china", "china-catalog-index.json"],
].map(async ([edition, name]) => [edition, JSON.parse(await readFile(path.join(root, "generated", name), "utf8"))])));
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const image = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='650' height='150'%3E%3Crect width='650' height='150' fill='%23a9a78a'/%3E%3C/svg%3E";
const counter = (variant) => `<span class="daily-active-display daily-active-display--${variant}"><i></i><span>今日活跃</span><strong>12,345</strong></span>`;
function fixture(edition, language, detail) {
  const international = edition === "international";
  const wordmark = international
    ? `<span class="faction-dock__wordmark iron-rice-hall-wordmark"><img src="${image}" width="650" height="150" alt=""><strong>铁皮饭堂</strong></span>`
    : `<img class="faction-dock__wordmark" src="${image}" alt="铁皮饭堂">`;
  const flags = catalogs[edition].groups.map(({ id }, index) => `<button type="button" class="faction-dock__flag" data-faction="${id}" data-active="${index === 0}" aria-label="${id}"><span class="faction-dock__flag-shape"><img class="${international ? "faction-dock__flag-image" : ""}" src="${image}" alt=""></span></button>`).join("");
  return `<!doctype html><html lang="${language}"><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles}<style>*, *::before, *::after { transition: none !important; animation: none !important; }</style></head><body><div class="site-shell" data-site-edition="${edition}" data-detail-open="${detail}"><section class="faction-selector" data-selected="true"><nav class="faction-dock"><div class="faction-dock__brand"><div class="faction-dock__brand-identity"><button class="faction-dock__home" type="button">${wordmark}</button>${counter("dock")}</div><h2><span>${language === "en" ? "Armed Forces" : "中国人民"}</span><span>${language === "en" ? "of the World" : "解放军"}</span></h2></div><div class="faction-dock__flags">${flags}</div><div class="faction-dock__actions"><span class="site-language-switcher"><select aria-label="Language"><option ${language === "zh-CN" ? "selected" : ""}>简体中文</option><option>繁體中文</option><option ${language === "en" ? "selected" : ""}>English</option></select></span>${international ? counter("dock-mobile") : ""}<div class="global-vehicle-search global-vehicle-search--dock"><label class="global-vehicle-search__input"><svg width="18" height="18"></svg><input type="search" placeholder="${language === "en" ? "Search vehicles" : "搜索载具"}"></label></div></div></nav></section><div class="catalog-reveal" data-active="true"><main class="catalog-main"><button id="catalog-content">Catalog content</button></main></div></div></body></html>`;
}
const cases = [];
for (const edition of ["international", "china"]) {
  for (const width of widths) {
    for (const language of ["zh-CN", "en"]) {
      for (const detail of [false, true]) cases.push({ edition, width, language, detail });
    }
  }
}
const directory = await mkdtemp(path.join(tmpdir(), "armor-dock-layout-"));
try {
  const frames = cases.map((entry) => `<iframe style="display:block;width:${entry.width}px;height:760px;border:0" srcdoc="${escapeHtml(fixture(entry.edition, entry.language, entry.detail))}"></iframe>`).join("");
  const source = `<!doctype html><meta charset="utf-8"><body>${frames}<pre id="results"></pre><script>
window.addEventListener("load", () => {
  const inlineStyles = ${JSON.stringify(inlineStyles).replaceAll("<", "\\u003c")};
  if (inlineStyles) for (const frame of document.querySelectorAll("iframe")) {
    const style = frame.contentDocument.createElement("style");
    style.textContent = inlineStyles;
    frame.contentDocument.head.prepend(style);
  }
  const cases = ${JSON.stringify(cases)};
  const results = Array.from(document.querySelectorAll("iframe"), (frame, index) => {
    const doc = frame.contentDocument;
    const view = frame.contentWindow;
    const failures = [];
    const rect = (element) => element.getBoundingClientRect();
    const overlap = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    const dock = doc.querySelector(".faction-dock");
    const flags = Array.from(doc.querySelectorAll(".faction-dock__flag"));
    const controls = [doc.querySelector(".faction-dock__home"), doc.querySelector("select"), doc.querySelector("input")];
    for (const control of controls) {
      const box = rect(control);
      if (box.width < 24 || box.height < 16 || box.left < -1 || box.right > view.innerWidth + 1) failures.push("control outside viewport: " + control.tagName);
      const hit = doc.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      if (hit !== control && !control.contains(hit)) failures.push("control obscured: " + control.tagName + " by " + hit?.className);
    }
    for (let a = 0; a < controls.length; a++) for (let b = a + 1; b < controls.length; b++) {
      if (overlap(rect(controls[a]), rect(controls[b]))) failures.push("controls overlap: " + controls[a].tagName + "/" + controls[b].tagName);
    }
    const rail = doc.querySelector(".faction-dock__flags");
    for (const flag of flags) {
      // The mobile rail is intentionally scrollable; every flag must be reachable.
      if (rail.scrollWidth > rail.clientWidth) rail.scrollLeft = flag.offsetLeft - (rail.clientWidth - flag.offsetWidth) / 2;
      const box = rect(flag);
      const hit = doc.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      if (!flag.contains(hit)) failures.push("flag obscured: " + flag.dataset.faction + " by " + (hit?.tagName || "offscreen"));
      if (controls.some((control) => overlap(box, rect(control)))) failures.push("flag/control overlap: " + flag.dataset.faction);
    }
    if (doc.documentElement.scrollWidth > view.innerWidth) failures.push("page horizontal overflow");
    const content = rect(doc.querySelector("#catalog-content"));
    if (content.top < rect(dock).bottom - 1) failures.push("catalog starts under dock");
    return { ...cases[index], flags: flags.length, height: rect(dock).height, failures };
  });
  document.querySelector("#results").textContent = JSON.stringify(results);
});
</script>`;
  const filename = path.join(directory, "layout.html");
  await writeFile(filename, source);
  if (fixtureOutput) {
    await writeFile(path.resolve(fixtureOutput), source);
    console.log(`Wrote ${cases.length} self-contained browser layout cases to ${fixtureOutput}.`);
    process.exitCode = 0;
  } else {
    const output = execFileSync(process.env.CHROMIUM_PATH || "chromium", [
      "--headless", "--disable-gpu", "--disable-dev-shm-usage",
      "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND",
      `--user-data-dir=${path.join(directory, "profile")}`, "--dump-dom",
      "--virtual-time-budget=2000", pathToFileURL(filename).href,
    ], { encoding: "utf8", maxBuffer: 5 * 1024 * 1024, timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
    const match = output.match(/<pre id="results">([^<]+)<\/pre>/u);
    assert.ok(match, "Chromium must finish evaluating every layout fixture");
    const results = JSON.parse(match[1].replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&"));
    const failures = results.filter(({ failures }) => failures.length);
    if (failures.length) console.error(JSON.stringify(failures, null, 2));
    assert.equal(failures.length, 0, `${failures.length} layout cases failed`);
    console.log(`PASS: ${results.length} dock layouts, both editions/languages/detail modes, ${widths.join("/")}px; all flag and language/search hit tests passed.`);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
