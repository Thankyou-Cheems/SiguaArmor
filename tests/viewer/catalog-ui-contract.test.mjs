import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [catalogSource, groupingSource, viewerSource, runtimeOnlySource, rendererSource, styles, damageTypeSource] = await Promise.all([
  readFile(new URL("../../app/CatalogApp.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/vehicle-card-grouping.ts", import.meta.url), "utf8"),
  readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/RuntimeViewerOnlyPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../lib/hit-scene-three-renderer.ts", import.meta.url), "utf8"),
  readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../../lib/vehicle-damage-type-icons.ts", import.meta.url), "utf8"),
]);

test("explosion coverage preserves armor opacity and projects elevated ranges to ground", () => {
  assert.doesNotMatch(
    rendererSource,
    /alpha\s*=\s*max\(alpha,\s*settledDamageHighlight/u,
  );
  assert.match(viewerSource, /radialDamageGroundIntersectionRadiusM/u);
  assert.match(viewerSource, /editor-native-shot-explosion-ground-height-label/u);
  assert.match(viewerSource, /paintShotExplosionGroundHeight/u);
});

test("standalone runtime preview loads vehicle mechanics before radial coverage", () => {
  assert.match(runtimeOnlySource, /loadWikiVehicleFactionMechanics/u);
  assert.match(runtimeOnlySource, /referenceDataForWikiVehicleBinding/u);
  assert.match(runtimeOnlySource, /referenceData=\{state\.referenceData\}/u);
});

test("vehicle cards show crew and passenger counts and reuse encyclopedia stat icons", () => {
  assert.match(
    catalogSource,
    /passengerSeatCount\s*=\s*[\s\S]*?Math\.max\(0, totalSeatCount - crewSeatCount\)/u,
  );
  assert.match(catalogSource, /aria-label="组员\/乘员"/u);
  assert.match(
    catalogSource,
    /<HeartPulse size=\{17\}[\s\S]*?<span>载具耐久<\/span>[\s\S]*?<Ticket size=\{17\}[\s\S]*?<span>票值<\/span>/u,
  );
});

test("vehicle cards collapse only explicit liveries of the same product configuration", () => {
  assert.doesNotMatch(groupingSource, /mechanicsSignatureId/u);
  assert.match(groupingSource, /vehicleName[\s\S]*?configuration/u);
  assert.match(groupingSource, /liveries\.every[\s\S]*?new Set\(liveries\)\.size === bucket\.length/u);
  assert.match(
    catalogSource,
    /canonicalRawName:[\s\S]*?editorAvailability\?\.mechanicalRawName/u,
  );
});

test("weapon selector has no legend row and keeps per-option text labels", () => {
  const effectLegend = viewerSource.slice(
    viewerSource.indexOf("function RuntimeWeaponEffectLegend"),
    viewerSource.indexOf("function RuntimeWeaponSourceSelector"),
  );
  assert.match(effectLegend, /effectLabel/u);
  assert.doesNotMatch(effectLegend, /<(?:VehicleDamageTypeIcon|WeaponPenetrationIcon)\b/u);
  assert.doesNotMatch(viewerSource, /RuntimeWeaponSelectorLegend|infantry-weapon-select__legend/u);
  assert.doesNotMatch(styles, /\.infantry-weapon-select__legend/u);
  const effectLabelStyles = styles.slice(
    styles.indexOf(".infantry-weapon-effect-chip__label"),
    styles.indexOf(".infantry-weapon-effect-chip > b"),
  );
  assert.doesNotMatch(effectLabelStyles, /text-shadow|filter/u);
  assert.match(effectLabelStyles, /justify-self:\s*start;/u);
  assert.match(
    styles,
    /\.infantry-weapon-select__metrics\s*\{[\s\S]*?align-self:\s*stretch;/u,
  );
  assert.match(
    styles,
    /\.infantry-weapon-effect-legend\s*\{[\s\S]*?height:\s*100%;/u,
  );
  assert.match(
    styles,
    /\.infantry-weapon-effect-legend__column\s*\{[\s\S]*?align-self:\s*stretch;/u,
  );
  assert.match(
    styles,
    /\.infantry-weapon-select \.viewer-search-select__group > button\s*\{[\s\S]*?padding-block:\s*0;/u,
  );
  assert.match(
    styles,
    /button:nth-of-type\(even\):not\(:hover\):not\(:focus-visible\):not\(\[data-selected="true"\]\)\s*\{\s*background:\s*rgba\(225, 200, 155, 0\.022\);/u,
  );
});

test("weapon selector menu and collapsed trigger share labeled columns", () => {
  assert.match(
    viewerSource,
    /className="viewer-search-select__search"[\s\S]*?className="infantry-weapon-select__columns"[\s\S]*?<span>武器 \/ 弹种<\/span>[\s\S]*?<span>穿深<\/span>[\s\S]*?<span>伤害<\/span>[\s\S]*?<span>爆炸<\/span>/u,
  );
  assert.match(
    styles,
    /\.infantry-weapon-select\s*\{[\s\S]*?--weapon-selector-grid:/u,
  );
  assert.match(
    styles,
    /\.infantry-weapon-select\[data-source-filtered="true"\][\s\S]*?\.viewer-search-select__trigger\s*\{[\s\S]*?grid-template-columns:\s*var\(--weapon-selector-grid\);/u,
  );
  assert.match(
    styles,
    /\.infantry-weapon-select \.viewer-search-select__group > button\s*\{[\s\S]*?grid-template-columns:\s*var\(--weapon-selector-grid\);/u,
  );
  assert.match(
    styles,
    /\.infantry-weapon-select__columns\s*\{[\s\S]*?grid-template-columns:\s*var\(--weapon-selector-grid\);/u,
  );
  assert.match(
    styles,
    /\.infantry-weapon-select \.viewer-search-select__menu\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none;/u,
  );
});

test("explosive shots expose one draggable non-contact origin with reset guidance", () => {
  assert.match(viewerSource, /editor-native-shot-explosion-drag-handle/u);
  assert.match(viewerSource, /editor-native-explosion-origin-core/u);
  assert.match(viewerSource, /editor-native-explosion-origin-halo/u);
  assert.match(viewerSource, /editor-native-shot-explosion-impact-anchor/u);
  assert.doesNotMatch(viewerSource, /editor-native-explosion-origin-orbit-|editor-native-explosion-origin-burst|editor-native-shot-explosion-offset-direction/u);
  assert.match(viewerSource, /viewer-explosion-origin-hud__offset/u);
  assert.doesNotMatch(viewerSource, /new THREE\.RingGeometry\(0\.11, 0\.16/u);
  assert.match(viewerSource, /pickExplosionDragHandle/u);
  assert.match(viewerSource, /setShotExplosionOriginRef\.current/u);
  assert.match(viewerSource, /radialOriginOverrideM/u);
  assert.match(viewerSource, /className="viewer-explosion-origin-hud"/u);
  assert.match(viewerSource, /explosionOriginPlacementTargetsVehicle/u);
  assert.match(viewerSource, /点击载具命中并在接触点引爆/u);
  assert.match(viewerSource, /\? "命中"/u);
  assert.match(viewerSource, /自由爆心；拖动调整水平位置/u);
  assert.match(viewerSource, /贴回命中点/u);
  assert.match(viewerSource, /explosionGroundFloorY/u);
  assert.match(viewerSource, /originTether\.geometry\.setFromPoints/u);
  assert.doesNotMatch(viewerSource, /viewer-explosion-origin-control/u);
  assert.match(
    styles,
    /\.viewer-explosion-origin-hud\[data-detached="true"\]/u,
  );
  assert.match(styles, /viewer-explosion-origin-ring/u);
});

test("explosive selection previews a ground-following true-radius ring before the first shot", () => {
  assert.match(viewerSource, /selectedWeaponHasExplosion/u);
  assert.match(viewerSource, /selectedWeaponBallistics[\s\S]*?resolveEditorNativeBallistics/u);
  assert.match(viewerSource, /saveExplosionOrigin/u);
  assert.match(viewerSource, /updateExplosionPlacementPreview/u);
  assert.match(viewerSource, /explosionPlacementPreview\.exactRadiusRings/u);
  assert.match(viewerSource, /outerRadiusCm\s*\/\s*100/u);
  assert.doesNotMatch(
    styles,
    /viewer-explosion-origin-hud\[data-placement="true"\][\s\S]*?top:\s*58%;[\s\S]*?left:\s*50%;/u,
  );
  const pointerUpSource = viewerSource.slice(
    viewerSource.indexOf("const onPointerUp ="),
    viewerSource.indexOf("const onPointerCancel ="),
  );
  assert.match(pointerUpSource, /saveExplosionOriginRef\.current/u);
  assert.doesNotMatch(
    pointerUpSource,
    /!pointerStart\s*\|\|\s*!parsed\s*\|\|\s*!analysisMesh/u,
  );
  assert.match(viewerSource, /editor-native-shot-explosion-ground-area/u);
  assert.match(viewerSource, /explosionPlacementCoverage/u);
  assert.match(viewerSource, /simulatePublishedRadialShot/u);
  assert.match(viewerSource, /setHitSceneThreeModelDamageHighlight\(hitModel/u);
  assert.match(viewerSource, /scheduleExplosionPlacementPreview/u);
  assert.match(viewerSource, /className="viewer-explosion-origin-hud__coverage"/u);
  assert.match(styles, /viewer-explosion-origin-hud__coverage\[data-state="covered"\]/u);
});

test("penetration and damage cards use inline text without standalone legend rows", () => {
  assert.doesNotMatch(viewerSource, /PathMetricLegend|viewer-path-metric-legend/u);
  assert.doesNotMatch(viewerSource, /viewer-damage-lane__legend/u);
  assert.doesNotMatch(styles, /\.viewer-path-metric-legend|\.viewer-damage-lane__legend/u);
  assert.match(
    viewerSource,
    /className="viewer-causal-spine__columns"[\s\S]*?<span>厚度 · mm<\/span>[\s\S]*?<span>剩余 · mm<\/span>[\s\S]*?<span>结果<\/span>/u,
  );
  assert.doesNotMatch(viewerSource, /viewer-layer-metric-label/u);
  const pathTimeline = viewerSource.slice(
    viewerSource.indexOf('<ol className="viewer-causal-spine">'),
    viewerSource.indexOf("{damageEventsByLayer.unassigned.length > 0"),
  );
  assert.doesNotMatch(pathTimeline, /toFixed\(1\)\} mm/u);
  assert.doesNotMatch(viewerSource, /穿透路径|\bHP\b|viewer-damage-target__type-label/u);
  assert.match(damageTypeSource, /heat:\s*"破甲"/u);
  assert.match(damageTypeSource, /hat:\s*"重破甲"/u);
  assert.doesNotMatch(damageTypeSource, /HEAT|HAT/u);
});

test("shot summary uses text labels instead of pictograms", () => {
  const shotSummary = viewerSource.slice(
    viewerSource.indexOf('<div className="viewer-shot-heading">'),
    viewerSource.indexOf('<ol className="viewer-causal-spine">'),
  );
  assert.match(shotSummary, /<b>\{ballisticsPenetrationKind[\s\S]*?"破甲"\s*:\s*"穿深"\}<\/b>/u);
  assert.match(shotSummary, /<b>伤害<\/b>/u);
  assert.match(shotSummary, /<b>后效<\/b>/u);
  assert.match(shotSummary, /className="viewer-shot-weapon-name"[\s\S]*?activeShotWeaponName/u);
  assert.doesNotMatch(shotSummary, /<(?:WeaponPenetrationIcon|Swords|MoveRight)\b/u);
  assert.match(styles, /\.viewer-shot-outcome-summary__hull-health > i > b\s*\{[\s\S]*?rgba\(255, 92, 82, 0\.92\)/u);
  assert.match(
    styles,
    /\.viewer-shot-heading\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;/u,
  );
  assert.match(
    styles,
    /\.viewer-shot-weapon-name\s*\{[\s\S]*?max-width:\s*none;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*normal;/u,
  );
  assert.match(
    styles,
    /\.viewer-shot-metrics\s*\{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?margin-left:\s*0;/u,
  );
});

test("expanded hit DPS yields vertical space to the complete hit result first", () => {
  const resultPanelStyles = styles.slice(
    styles.indexOf(".viewer-shot-result {"),
    styles.indexOf(".viewer-shot-history {"),
  );
  assert.match(
    resultPanelStyles,
    /\.viewer-shot-result\s*\{[\s\S]*?max-height:\s*calc\(100% - 24px\);/u,
  );
  assert.doesNotMatch(resultPanelStyles, /max-height:[^;]*520px/u);
  assert.match(
    resultPanelStyles,
    /\.viewer-shot-result__scroll\s*\{[\s\S]*?flex:\s*0 1 auto;/u,
  );
  assert.match(
    resultPanelStyles,
    /\.viewer-hit-dps-fold\[open\]\s*\{[\s\S]*?flex:\s*1 999 auto;[\s\S]*?overflow:\s*hidden;/u,
  );
  assert.match(
    resultPanelStyles,
    /\.viewer-hit-dps-fold\[open\] \.viewer-hit-dps-fold__body\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?max-height:\s*none;/u,
  );
});

test("vehicle-damaging realtime aim feedback uses the shared success green", () => {
  assert.match(styles, /--pointer-outline-damage:\s*var\(--status-confirmed\);/u);
  assert.match(
    styles,
    /\.viewer-realtime-readout\[data-outline="damage"\]\s*\{[\s\S]*?border-color:[\s\S]*?var\(--pointer-outline-damage\)[\s\S]*?background:[\s\S]*?var\(--pointer-outline-damage\)/u,
  );
  assert.match(
    styles,
    /\.viewer-realtime-crosshair\[data-outline="damage"\]\s*\{[\s\S]*?--pointer-outline:\s*var\(--pointer-outline-damage\);/u,
  );
});

test("effective damage uses the selected B health-rail summary above the causal spine", () => {
  assert.match(
    viewerSource,
    /const effectiveDamageEvents = \[[\s\S]*?\.\.\.penetrationDamageEvents,[\s\S]*?\.\.\.explosionDamageEvents/u,
  );
  assert.match(
    viewerSource,
    /groupDamageEventsByVisibleLayer\([\s\S]*?visibleShotLayers,[\s\S]*?effectiveDamageEvents/u,
  );
  assert.match(
    viewerSource,
    /effectiveDamageEvents\.length > 0[\s\S]*?viewer-shot-outcome-summary/u,
  );
  assert.match(
    viewerSource,
    /layerDamageEvents\.length > 0[\s\S]*?<DamageSettlementListItems/u,
  );
  assert.match(
    viewerSource,
    /outcome\.effect \? <em>\{outcome\.effect\.label\}<\/em> : null/u,
  );
  assert.doesNotMatch(
    viewerSource,
    /viewer-damage-lane--penetration|viewer-damage-lane--explosion|viewer-damage-target/u,
  );
  assert.match(viewerSource, /className="viewer-causal-spine__step"[\s\S]*?className="viewer-causal-spine__layer"/u);
  assert.match(viewerSource, /className="viewer-causal-spine__settlement"/u);
  assert.doesNotMatch(viewerSource, /viewer-layer-list|viewer-causal-settlements/u);
  assert.match(styles, /\.viewer-causal-spine\s*\{[\s\S]*?padding:\s*0 0 0 25px;/u);
  assert.match(styles, /\.viewer-causal-spine__step\s*\{[\s\S]*?gap:\s*0;/u);
  assert.match(styles, /\.viewer-causal-spine__settlement\s*\{[\s\S]*?margin-left:\s*0;[\s\S]*?border:\s*0;/u);
  const settlementItems = viewerSource.slice(
    viewerSource.indexOf("function DamageSettlementListItems"),
    viewerSource.indexOf("function paintShotPathMarker"),
  );
  assert.doesNotMatch(settlementItems, /<i aria-hidden="true">→<\/i>/u);
  assert.doesNotMatch(styles, /\.viewer-causal-spine__settlement > i/u);
  assert.match(styles, /\.viewer-causal-spine__settlement\[data-damage-kind="radial"\]/u);
  assert.match(viewerSource, /className="viewer-causal-spine__settlement viewer-causal-spine__settlement--forwarded"/u);
  assert.match(viewerSource, /className="viewer-causal-spine__forwarding-calculation"/u);
  assert.match(viewerSource, /className="viewer-causal-spine__forwarding-targets"/u);
  assert.match(viewerSource, /<em aria-hidden="true">↓<\/em>/u);
  assert.match(styles, /\.viewer-causal-spine__settlement--forwarded\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/u);
  assert.doesNotMatch(viewerSource, /伤害计算|伤害去向|DamageTransferPrototype|damageTransferVariant/u);
  assert.doesNotMatch(styles, /damage-transfer-prototype/u);
  assert.match(viewerSource, /index < visibleShotLayers\.length - 1[\s\S]*?viewer-causal-spine__connector/u);
  assert.match(styles, /\.viewer-causal-spine__connector\s*\{[\s\S]*?top:\s*27px;[\s\S]*?bottom:\s*-10px;/u);
  assert.match(styles, /\.viewer-causal-spine__connector > i::after\s*\{[\s\S]*?border-top:\s*7px solid var\(--analysis-flow\);/u);
  assert.match(viewerSource, /"--spine-accent": vehicleDamageTypeIconColor\(settlementColorKind\)/u);
  assert.match(viewerSource, /penetrationKind === "shaped-charge" \? "heat" : "kinetic"/u);
  assert.match(viewerSource, /<strong>\{metricText\(totalEffectiveDamage\)\}<\/strong>[\s\S]*?<sub>有效伤害<\/sub>/u);
  assert.match(
    viewerSource,
    /const totalEffectiveDamage = effectiveDamageEvents[\s\S]*?\.filter\(\(event\) => event\.poolKind === "hull"\)[\s\S]*?\.reduce/u,
  );
  assert.match(
    viewerSource,
    /const hullDamageOutcome = damageOutcomeSummaries\.find\([\s\S]*?outcome\.poolKind === "hull"/u,
  );
  assert.match(
    viewerSource,
    /const componentDamageOutcomes = damageOutcomeSummaries\.filter\([\s\S]*?outcome\.poolKind !== "hull"/u,
  );
  assert.match(viewerSource, /className="viewer-shot-outcome-summary__hull-health"/u);
  assert.match(viewerSource, /<b style=\{\{ width: `\$\{hullHealthPercent\}%` \}\} \/>/u);
  const damageOutcomeRows = viewerSource.slice(
    viewerSource.indexOf("componentDamageOutcomes.slice(0, 4).map"),
    viewerSource.indexOf("componentDamageOutcomes.length > 4"),
  );
  assert.doesNotMatch(damageOutcomeRows, />穿透</u);
  assert.doesNotMatch(damageOutcomeRows, /outcome\.poolKind === "hull"/u);
  assert.match(styles, /\.viewer-shot-outcome-summary__total-value > strong\s*\{[\s\S]*?font-size:\s*30px;/u);
  assert.match(styles, /\.viewer-shot-outcome-summary__target-heading > b\s*\{[\s\S]*?font-size:\s*12px;/u);
  assert.match(styles, /\.viewer-shot-outcome-summary__health-rail > b\s*\{[\s\S]*?font-size:\s*8px;/u);
  assert.doesNotMatch(viewerSource, /DamageOutcomeCardPrototype|damageCardVariant/u);
  assert.doesNotMatch(styles, /damage-card-prototype/u);
});

test("saved shots default to three positions while embedded callers can lower the limit", () => {
  const toolbar = viewerSource.slice(
    viewerSource.indexOf('<div className="viewer-toolbar"'),
    viewerSource.indexOf("{viewerState.kind !== \"loading\""),
  );
  const shotHistory = viewerSource.slice(
    viewerSource.indexOf('<div className="viewer-shot-history"'),
    viewerSource.indexOf('<div className="viewer-shot-heading"'),
  );
  assert.doesNotMatch(toolbar, /viewer-clear-traces/u);
  assert.match(shotHistory, /viewer-shot-history__clear/u);
  assert.doesNotMatch(shotHistory, /路径记录|清除射线/u);
  assert.match(
    shotHistory,
    /className="viewer-mode-tabs viewer-shot-history__tabs"[\s\S]*?aria-label=\{`\$\{maxShotTraces\} 条命中记录`\}[\s\S]*?className="viewer-mode-tabs__thumb"[\s\S]*?Array\.from\(\{ length: maxShotTraces \}/u,
  );
  assert.match(viewerSource, /shotTraceLimit = MAX_SHOT_TRACES/u);
  assert.match(shotHistory, /<span>记录<\/span><b>\{index \+ 1\}<\/b>/u);
  assert.match(shotHistory, /清空\{savedShots\.length\}/u);
  assert.match(
    styles,
    /\.viewer-shot-history__clear\s*\{[\s\S]*?margin-left:\s*auto;/u,
  );
  assert.match(
    styles,
    /\.viewer-shot-history__tabs\s*\{[\s\S]*?width:\s*min\(246px, calc\(100% - 54px\)\);/u,
  );
});

test("China dock scrolls with the page, search aligns right, and detail keeps wider gutters", () => {
  assert.match(
    styles,
    /\.catalog-main\[data-detail-open="true"\]\s*\{[\s\S]*?width:\s*calc\(100% - 48px\);[\s\S]*?margin-inline:\s*auto;/u,
  );
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="china"\][\s\S]*?\.faction-selector\[data-selected="true"\][\s\S]*?\.faction-dock\s*\{\s*position:\s*absolute;/u,
  );
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="china"\] \.faction-dock__actions\s*\{[\s\S]*?justify-self:\s*end;/u,
  );
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="international"\]\[data-detail-open="true"\][\s\S]*?\.faction-dock\s*\{\s*padding-inline:\s*8px;/u,
  );
  assert.doesNotMatch(
    styles,
    /\.site-shell\[data-detail-open="true"\][\s\S]*?\.faction-dock\s*\{\s*padding-inline:\s*8px;/u,
  );
});

test("compact vehicle cards wrap both identity lines instead of truncating them", () => {
  assert.match(
    styles,
    /\.catalog-workspace\[data-detail-open="true"\] \.vehicle-card__name\s*\{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?text-overflow:\s*clip;[\s\S]*?white-space:\s*normal;/u,
  );
  assert.match(
    styles,
    /\.catalog-workspace\[data-detail-open="true"\] \.vehicle-card__alias\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?text-overflow:\s*clip;[\s\S]*?white-space:\s*normal;/u,
  );
  assert.match(
    styles,
    /\.catalog-workspace\[data-detail-open="true"\] \.vehicle-card__label\s*\{[\s\S]*?height:\s*auto;[\s\S]*?grid-template-rows:\s*auto auto;/u,
  );
});

test("left viewer controls share one rail and use slider-shaped state controls", () => {
  const toolbar = viewerSource.slice(
    viewerSource.indexOf('<div className="viewer-toolbar"'),
    viewerSource.indexOf('{viewerState.kind !== "loading"'),
  );
  assert.match(
    toolbar,
    /className="viewer-mode-tabs"[\s\S]*?"--viewer-mode-count"[\s\S]*?"--viewer-mode-index"[\s\S]*?className="viewer-mode-tabs__thumb"/u,
  );
  assert.equal((toolbar.match(/<TurretPreviewControls\b/gu) ?? []).length, 1);
  assert.ok(
    toolbar.indexOf('<RuntimeViewerCameraControls') > toolbar.indexOf('className="viewer-mode-tabs"'),
    "camera shortcuts should follow the render mode switcher",
  );
  assert.ok(
    toolbar.indexOf('<TurretPreviewControls') > toolbar.lastIndexOf('className="viewer-spaced-armor-row"'),
    "turret posture control should follow every top-left state switch",
  );
  assert.ok(
    toolbar.indexOf('<TurretPreviewControls') < toolbar.indexOf('className="viewer-interaction-hint'),
    "turret posture control should be the last expandable control",
  );
  assert.match(
    styles,
    /\.viewer-protection-controls\s*\{[\s\S]*?--viewer-control-width:\s*266px;[\s\S]*?width:\s*var\(--viewer-control-width\);[\s\S]*?justify-items:\s*stretch;/u,
  );
  assert.match(styles, /\.viewer-protection-primary\s*\{[\s\S]*?width:\s*100%;/u);
  assert.match(styles, /\.viewer-protection-precision\s*\{[\s\S]*?width:\s*100%;/u);
  assert.match(
    styles,
    /\.viewer-mode-tabs__thumb\s*\{[\s\S]*?transform:\s*translateX\(calc\(var\(--viewer-mode-index\) \* 100%\)\);/u,
  );
  assert.match(
    styles,
    /\.viewer-protection-switch__track\s*\{[\s\S]*?border-radius:\s*0;/u,
  );
  assert.match(
    styles,
    /\.viewer-protection-switch__track > span\s*\{[\s\S]*?border-radius:\s*0;/u,
  );
  assert.match(
    styles,
    /\.viewer-toolbar \.viewer-protection-controls > \.turret-preview-controls\s*\{[\s\S]*?position:\s*relative;[\s\S]*?width:\s*100%;/u,
  );
});

test("camera shortcuts move the loaded camera instead of remounting vehicle assets", () => {
  const cameraActions = viewerSource.slice(
    viewerSource.indexOf("const applySquadPerspective ="),
    viewerSource.indexOf("resetViewRef.current = resetView"),
  );
  assert.match(cameraActions, /camera\.position/u);
  assert.match(cameraActions, /controls\.target/u);
  assert.match(cameraActions, /camera\.fov = verticalFovForHorizontalFov/u);
  assert.match(cameraActions, /runtimeViewerInfantryCameraPosition/u);
  assert.match(cameraActions, /runtimeViewerCameraPose/u);
  assert.doesNotMatch(
    cameraActions,
    /fetch\(|loadWiki|GLTFLoader|startExteriorAssets|startAnalysisVisualAssets/u,
  );
});

test("radial coverage copy requires actual radial damage to the vehicle", () => {
  assert.match(
    viewerSource,
    /const hasVehicleRadialDamage = shotResult\?\.damage\.some/u,
  );
  assert.match(
    viewerSource,
    /hasVehicleRadialDamage &&[\s\S]*?viewer-radial-coverage-note/u,
  );
});
