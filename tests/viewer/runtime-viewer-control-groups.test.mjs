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

test("left 3D controls keep render choices above one flat switch list", () => {
  const sectionIds = [...viewerSource.matchAll(
    /data-control-section="([^"]+)"/gu,
  )].map((match) => match[1]);

  assert.deepEqual(sectionIds, []);
  assert.doesNotMatch(viewerSource, /场景与分析/u);
  assert.doesNotMatch(viewerSource, /显示模式/u);
  assert.match(viewerSource, /className="viewer-flat-control-list"/u);
  assert.match(viewerSource, /显示附加装甲\/无敌区域/u);
  assert.match(viewerSource, /显示乘员位置与受击判定/u);
  assert.doesNotMatch(viewerSource, /data-control-section="camera"/u);
  assert.doesNotMatch(viewerSource, /className="viewer-control-section"/u);
  assert.doesNotMatch(viewerSource, /data-control-section="weapon"/u);
  assert.equal(
    sectionIds.every((sectionId) => viewerSource.includes(
      `data-control-section="${sectionId}"`,
    )),
    true,
  );
});

test("render mode stays above flat switches and protection tuning stays last", () => {
  const modeTabsIndex = viewerSource.indexOf('className="viewer-mode-tabs"');
  const flatControlsIndex = viewerSource.indexOf(
    'className="viewer-flat-control-list"',
  );

  assert.ok(modeTabsIndex >= 0 && modeTabsIndex < flatControlsIndex);
  assert.doesNotMatch(viewerSource, /viewer-control-section__status/u);
  assert.match(
    viewerStyles,
    /\.viewer-flat-control-list > \.viewer-spaced-armor-row\s*\{\s*order:\s*10;/u,
  );
  assert.match(
    viewerStyles,
    /\.viewer-flat-control-list > \.viewer-crew-occupant-row\s*\{\s*order:\s*20;/u,
  );
  assert.match(
    viewerStyles,
    /\.viewer-flat-control-list > \.viewer-protection-primary\s*\{\s*order:\s*40;/u,
  );
});

test("camera, driver and station controls share one flat right-side panel", () => {
  assert.match(viewerSource, /const \[controlPanelOpen, setControlPanelOpen\]/u);
  assert.match(
    viewerSource,
    /const \[controlPanelOpen, setControlPanelOpen\] = useState\(true\)/u,
  );
  assert.match(viewerSource, /const \[controlTargetId, setControlTargetId\]/u);
  assert.match(viewerSource, /className="viewer-weapon-panel-launcher"/u);
  assert.match(viewerSource, /aria-controls="viewer-weapon-panel"/u);
  assert.match(viewerSource, /id="viewer-weapon-panel"/u);
  assert.match(viewerSource, /className="viewer-weapon-panel"/u);
  assert.match(
    viewerSource,
    /className="viewer-control-target-slider"[\s\S]*?相机[\s\S]*?驾驶 · F1/u,
  );
  assert.match(viewerSource, /showStationSelector=\{false\}/u);
  assert.match(viewerSource, /<RuntimeViewerCameraControls/u);
  assert.match(viewerSource, /<ChevronRight size=\{15\}/u);
  assert.doesNotMatch(viewerSource, /收起 ›/u);
  assert.match(viewerSource, /viewer-control-target-slider__thumb/u);
  assert.match(viewerSource, /viewer-control-target-slider__station-group/u);
  assert.match(viewerSource, /<b[^>]*>武器站<\/b>/u);
  assert.doesNotMatch(viewerSource, /--control-station-left/u);
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
  assert.match(viewerStyles, /\.viewer-control-target-row/u);
  assert.match(viewerStyles, /\.viewer-control-target-slider/u);
  assert.match(
    viewerStyles,
    /\.viewer-control-target-slider__thumb\s*\{[\s\S]*?transform:\s*translateX/u,
  );
  assert.match(
    viewerStyles,
    /\.viewer-control-target-slider__station-group\s*\{[\s\S]*?grid-column:\s*3\s*\/\s*-1;[\s\S]*?border:\s*1px solid rgba\(99, 215, 233/u,
  );
  assert.ok(
    viewerSource.indexOf('className="viewer-weapon-panel-launcher"') >
      viewerSource.indexOf('className="viewer-interaction-hint'),
    "right-side launcher must not live inside the left control deck",
  );
});

test("camera preset keys and distance units inherit one readable type scale", () => {
  assert.match(
    viewerStyles,
    /\.viewer-camera-presets button kbd,\s*\.viewer-camera-presets button small\s*\{[\s\S]*?font:\s*inherit;/u,
  );
  assert.doesNotMatch(
    viewerStyles,
    /\.viewer-camera-presets button kbd,\s*\.viewer-camera-presets button small\s*\{[^}]*font-size:\s*6px;/u,
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
  assert.match(
    viewerStyles,
    /\.viewer-state-switch,[\s\S]*?font:\s*700 8px\/1\.2 var\(--font-readable-display\);/u,
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
