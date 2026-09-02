import assert from "node:assert/strict";
import test from "node:test";

import {
  compileGunnerSightRenderLayers,
  gunnerSightProjectionIsVisible,
} from "../../lib/gunner-sight-presentation.ts";

const projection = (id) => ({
  id,
  sourceObjectPath: `/Game/Test/${id}.${id}`,
  materialTemplateObjectPath: null,
  kind: "lossless-rgba-webp",
  assetUrl: `/assets/vehicle-gunner-sights/reticle-${id.padEnd(64, "a")}.webp`,
});

const layout = (widgetName, zOrder) => ({
  state: "observed-canvas-panel-path",
  referenceCanvas: { width: 1920, height: 1080 },
  steps: [{
    widgetName,
    layoutMode: "canvas-panel",
    layoutData: {
      Offsets: { Left: 0, Top: 0, Right: 100, Bottom: 100 },
      Anchors: { Minimum: { X: 0, Y: 0 }, Maximum: { X: 0, Y: 0 } },
      Alignment: { X: 0, Y: 0 },
    },
    zOrder,
    renderTransform: null,
    renderTransformPivot: null,
  }],
});

test("renders the complete authored stack and replaces only the selected reticle target", () => {
  const projections = ["tunnel", "default", "ready", "zoom"].map(projection);
  const station = {
    layers: [{
      widgetName: "Tunnel",
      role: "viewport-screen",
      state: "observed-static-brush-resource",
      visibility: "Visible",
      projectionRef: "tunnel",
      paintOrder: 0,
      layout: layout("Tunnel", -1),
    }, {
      widgetName: "BlackPanel",
      role: "auxiliary-static",
      state: "observed-solid-brush",
      visibility: "Visible",
      projectionRef: null,
      brushDrawAs: "Image",
      colorAndOpacity: { R: 0, G: 0, B: 0, A: 1 },
      paintOrder: 1,
      layout: layout("BlackPanel", 0),
    }, {
      widgetName: "MainReticle",
      role: "reticle",
      state: "observed-static-brush-resource",
      visibility: "Visible",
      projectionRef: "default",
      paintOrder: 2,
      layout: layout("MainReticle", 1),
    }, {
      widgetName: "ReadyLight",
      role: "auxiliary-static",
      state: "observed-static-brush-resource",
      visibility: "Visible",
      projectionRef: "ready",
      paintOrder: 3,
      layout: layout("ReadyLight", 2),
    }, {
      widgetName: "Cracked_Screen",
      role: "damage-overlay",
      state: "excluded-default-collapsed-damage-layer",
      visibility: "Collapsed",
      projectionRef: null,
      paintOrder: 4,
      layout: layout("Cracked_Screen", 4),
    }],
    textLayers: [{
      widgetName: "APAmmo",
      role: "instrument-text",
      state: "observed-default-text",
      text: "穿",
      visibility: "Visible",
      renderOpacity: 1,
      font: { size: 32 },
      colorAndOpacity: { R: 1, G: 0.05, B: 0.05, A: 0.8 },
      paintOrder: 5,
      layout: layout("APAmmo", 3),
    }],
  };
  const activeStage = {
    zoomIndex: 0,
    sourceObjectPath: "/Game/Test/T_Zoom.T_Zoom",
    projectionRef: "zoom",
    projectionBindingKey: "variant",
    presentation: {
      kind: "material-texture-parameter",
      targetWidgetName: "MainReticle",
      materialTemplateRef: "/Game/Test/MI_Main.MI_Main",
      parameterName: "Texture",
      setterNodes: ["SetTexture"],
    },
  };

  const layers = compileGunnerSightRenderLayers(station, activeStage, projections);
  assert.deepEqual(
    layers.map(({ kind, widgetName }) => `${kind}:${widgetName}`),
    [
      "image:Tunnel",
      "solid:BlackPanel",
      "image:MainReticle",
      "image:ReadyLight",
      "text:APAmmo",
    ],
  );
  assert.equal(
    layers.find(({ widgetName }) => widgetName === "MainReticle").projection.id,
    "zoom",
  );
  assert.equal(
    layers.find(({ widgetName }) => widgetName === "ReadyLight").projection.id,
    "ready",
  );
  assert.equal(layers.some(({ widgetName }) => widgetName === "Cracked_Screen"), false);
});

test("keeps source global paint order across root and nested panel layers", () => {
  const projections = ["dial"].map(projection);
  const station = {
    layers: [{
      widgetName: "Dial",
      role: "auxiliary-static",
      state: "observed-static-brush-resource",
      visibility: "Visible",
      projectionRef: "dial",
      paintOrder: 2,
      layout: {
        state: "observed-canvas-panel-path",
        referenceCanvas: { width: 1920, height: 1080 },
        steps: [
          ...layout("Instruments", 0).steps,
          ...layout("Dial", 0).steps,
        ],
      },
    }, {
      widgetName: "SideMask",
      role: "auxiliary-static",
      state: "observed-solid-brush",
      visibility: "Visible",
      projectionRef: null,
      brushDrawAs: "Image",
      colorAndOpacity: { R: 0, G: 0, B: 0, A: 1 },
      paintOrder: 1,
      layout: layout("SideMask", 0),
    }],
    textLayers: [],
  };

  const layers = compileGunnerSightRenderLayers(station, undefined, projections);
  assert.deepEqual(
    layers.map(({ kind, widgetName }) => `${kind}:${widgetName}`),
    ["solid:SideMask", "image:Dial"],
  );
});

test("does not count an authored active projection as rendered after its source panel hides it", () => {
  const projections = ["default", "zoom"].map(projection);
  const station = {
    layers: [{
      widgetName: "MainReticle",
      role: "reticle",
      state: "observed-static-brush-resource",
      visibility: "Visible",
      projectionRef: "default",
      paintOrder: 1,
      layout: layout("MainReticle", 0),
    }],
    textLayers: [],
  };
  const activeStage = {
    zoomIndex: 1,
    sourceObjectPath: "/Game/Test/T_Zoom.T_Zoom",
    projectionRef: "zoom",
    projectionBindingKey: "variant",
    presentation: {
      kind: "material-texture-parameter",
      targetWidgetName: "MainReticle",
      materialTemplateRef: "/Game/Test/MI_Main.MI_Main",
      parameterName: "Texture",
      setterNodes: ["SetTexture"],
    },
  };
  const layers = compileGunnerSightRenderLayers(station, activeStage, projections);

  assert.equal(
    gunnerSightProjectionIsVisible(
      layers,
      "zoom",
      new Map([["MainReticle", false]]),
    ),
    false,
  );
  assert.equal(
    gunnerSightProjectionIsVisible(
      layers,
      "zoom",
      new Map([["MainReticle", true]]),
    ),
    true,
  );
});
