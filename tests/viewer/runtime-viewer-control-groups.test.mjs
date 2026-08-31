import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const viewerSource = await readFile(
  new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
  "utf8",
);
const catalogSource = await readFile(
  new URL("../../app/CatalogApp.tsx", import.meta.url),
  "utf8",
);
const turretSource = await readFile(
  new URL("../../app/TurretLimitsDisplay.tsx", import.meta.url),
  "utf8",
);
const viewerStyles = await readFile(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

test("left 3D controls keep only the three render choices above feature groups", () => {
  const sectionIds = [...viewerSource.matchAll(
    /data-control-section="([^"]+)"/gu,
  )].map((match) => match[1]);

  assert.deepEqual(sectionIds, ["analysis", "camera", "crew"]);
  assert.doesNotMatch(viewerSource, /场景与分析/u);
  assert.doesNotMatch(viewerSource, /显示模式/u);
  assert.match(viewerSource, /装甲与分析/u);
  assert.match(viewerSource, /相机与姿态/u);
  assert.match(viewerSource, /乘员显示/u);
  assert.doesNotMatch(viewerSource, /data-control-section="weapon"/u);
  assert.equal(
    sectionIds.every((sectionId) => viewerSource.includes(
      `data-control-section="${sectionId}"`,
    )),
    true,
  );
});

test("render mode remains visible while feature groups expose collapsed status", () => {
  const modeTabsIndex = viewerSource.indexOf('className="viewer-mode-tabs"');
  const firstSectionIndex = viewerSource.indexOf(
    'data-control-section="analysis"',
  );

  assert.ok(modeTabsIndex >= 0 && modeTabsIndex < firstSectionIndex);
  assert.match(
    viewerSource,
    /viewer-control-section__status/u,
    "collapsed groups should retain their live state in the summary",
  );
  assert.match(
    viewerStyles,
    /\.viewer-control-section:not\(\[open\]\)[\s\S]*?\.viewer-control-section__body[\s\S]*?display:\s*none/u,
  );
});

test("weapon controls open from a dedicated right-side launcher and panel", () => {
  assert.match(viewerSource, /const \[weaponPanelOpen, setWeaponPanelOpen\]/u);
  assert.match(viewerSource, /className="viewer-weapon-panel-launcher"/u);
  assert.match(viewerSource, /aria-controls="viewer-weapon-panel"/u);
  assert.match(viewerSource, /id="viewer-weapon-panel"/u);
  assert.match(viewerSource, /className="viewer-weapon-panel"/u);
  assert.match(
    viewerSource,
    /<TurretPreviewControls[\s\S]*?embedded/u,
  );
  assert.match(turretSource, /embedded\?:\s*boolean/u);
  assert.match(
    turretSource,
    /data-embedded=\{embedded \|\| undefined\}/u,
  );
  assert.match(
    viewerStyles,
    /\.turret-preview-controls\[data-embedded="true"\]/u,
  );
  assert.match(
    viewerStyles,
    /\.viewer-weapon-panel\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*12px;/u,
  );
  assert.match(
    viewerStyles,
    /\.viewer-weapon-panel-launcher\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*12px;/u,
  );
  assert.ok(
    viewerSource.indexOf('className="viewer-weapon-panel-launcher"') >
      viewerSource.indexOf('className="viewer-interaction-hint'),
    "right-side launcher must not live inside the left control deck",
  );
});

test("state switches share one slider treatment and category colors stay neutral", () => {
  assert.match(viewerSource, /viewer-state-switch/u);
  assert.match(turretSource, /viewer-state-switch/u);
  assert.match(turretSource, /viewer-state-switch__track/u);
  assert.match(
    viewerStyles,
    /\.viewer-state-switch__track\s*\{[\s\S]*?border-radius:\s*0;/u,
  );
  assert.doesNotMatch(
    viewerStyles,
    /viewer-control-section\[data-control-section="(?:view|crew|weapon)"\]/u,
  );
});

test("vehicle close control belongs to dialog chrome outside the 3D stage", () => {
  const viewerCall = catalogSource.slice(
    catalogSource.indexOf("<VehicleViewer"),
    catalogSource.indexOf("</Suspense>"),
  );

  assert.match(catalogSource, /className="detail-close detail-close--viewer"/u);
  assert.doesNotMatch(viewerCall, /onClose=/u);
  assert.match(
    viewerStyles,
    /\.detail-panel--viewer > \.detail-close\.detail-close--viewer\s*\{[\s\S]*?top:\s*-\d+px;/u,
  );
});

test("armor, interior, and exterior modes retain the same adjustment entries", () => {
  const controlSurface = viewerSource.slice(
    viewerSource.indexOf('<div className="viewer-toolbar"'),
    viewerSource.indexOf('{viewerState.kind !== "loading"'),
  );
  assert.doesNotMatch(
    controlSurface,
    /\(mode === "exterior" \|\| mode === "armor"\) && activeTurretStation/u,
  );
  assert.doesNotMatch(
    controlSurface,
    /mode === "armor" && hitState\.kind === "ready"/u,
  );
  assert.doesNotMatch(
    controlSurface,
    /mode === "exterior" && hitState\.kind === "ready"/u,
  );
  assert.match(viewerSource, /const specialArmorDisplayActive =/u);
  assert.match(controlSurface, /className="viewer-weapon-panel-launcher"/u);
});
