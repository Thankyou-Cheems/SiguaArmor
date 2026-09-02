import type {
  GunnerSightLayer,
  GunnerSightLayerLayoutStep,
} from "./vehicle-gunner-sight";

type Matrix2D = [number, number, number, number, number, number];

export interface GunnerSightLayerPlacement {
  viewBox: [number, number, number, number];
  width: number;
  height: number;
  matrix: Matrix2D;
  transform: string;
}

export type GunnerSightLayerFallbackKind = "reticle" | "screen";

export function gunnerSightLayerFallbackKind(
  layer: Pick<GunnerSightLayer, "role"> | null,
): GunnerSightLayerFallbackKind | null {
  if (!layer || layer.role === "reticle") return "reticle";
  if (layer.role === "viewport-screen") return "screen";
  return null;
}

function finite(values: unknown[]) {
  return values.every((value) => typeof value === "number" && Number.isFinite(value));
}

function multiply(left: Matrix2D, right: Matrix2D): Matrix2D {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

const translation = (x: number, y: number): Matrix2D => [1, 0, 0, 1, x, y];
const scaling = (x: number, y: number): Matrix2D => [x, 0, 0, y, 0, 0];

function rotation(angleDegrees: number): Matrix2D {
  const angle = angleDegrees * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [cosine, sine, -sine, cosine, 0, 0];
}

function shear(xDegrees: number, yDegrees: number): Matrix2D {
  return [
    1,
    Math.tan(yDegrees * Math.PI / 180),
    Math.tan(xDegrees * Math.PI / 180),
    1,
    0,
    0,
  ];
}

function slotRect(
  step: GunnerSightLayerLayoutStep,
  parentWidth: number,
  parentHeight: number,
) {
  if (step.layoutMode === "fill-parent") {
    return { x: 0, y: 0, width: parentWidth, height: parentHeight };
  }
  const layout = step.layoutData;
  if (!layout || step.autoSize === true) return null;
  const { Offsets: offsets, Anchors: anchors, Alignment: alignment } = layout;
  if (!finite([
    offsets.Left, offsets.Top, offsets.Right, offsets.Bottom,
    anchors.Minimum.X, anchors.Minimum.Y,
    anchors.Maximum.X, anchors.Maximum.Y,
    alignment.X, alignment.Y,
  ])) return null;
  const stretchedX = anchors.Minimum.X !== anchors.Maximum.X;
  const stretchedY = anchors.Minimum.Y !== anchors.Maximum.Y;
  const x = parentWidth * anchors.Minimum.X + offsets.Left -
    (stretchedX ? 0 : alignment.X * offsets.Right);
  const y = parentHeight * anchors.Minimum.Y + offsets.Top -
    (stretchedY ? 0 : alignment.Y * offsets.Bottom);
  const width = stretchedX
    ? parentWidth * anchors.Maximum.X - offsets.Right - x
    : offsets.Right;
  const height = stretchedY
    ? parentHeight * anchors.Maximum.Y - offsets.Bottom - y
    : offsets.Bottom;
  if (!finite([x, y, width, height]) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function stepMatrix(
  step: GunnerSightLayerLayoutStep,
  rect: { x: number; y: number; width: number; height: number },
) {
  const transform = step.renderTransform ?? {
    Translation: { X: 0, Y: 0 },
    Scale: { X: 1, Y: 1 },
    Shear: { X: 0, Y: 0 },
    Angle: 0,
  };
  const pivot = step.renderTransformPivot ?? { X: 0.5, Y: 0.5 };
  if (!finite([
    transform.Translation.X, transform.Translation.Y,
    transform.Scale.X, transform.Scale.Y,
    transform.Shear.X, transform.Shear.Y,
    transform.Angle, pivot.X, pivot.Y,
  ])) return null;
  const pivotX = pivot.X * rect.width;
  const pivotY = pivot.Y * rect.height;
  let matrix = translation(rect.x, rect.y);
  matrix = multiply(matrix, translation(
    transform.Translation.X,
    transform.Translation.Y,
  ));
  matrix = multiply(matrix, translation(pivotX, pivotY));
  matrix = multiply(matrix, rotation(transform.Angle));
  matrix = multiply(matrix, shear(transform.Shear.X, transform.Shear.Y));
  matrix = multiply(matrix, scaling(transform.Scale.X, transform.Scale.Y));
  matrix = multiply(matrix, translation(-pivotX, -pivotY));
  return matrix;
}

export function gunnerSightLayerPlacement(
  layer: Pick<GunnerSightLayer, "layout">,
): GunnerSightLayerPlacement | null {
  const layout = layer.layout;
  if (
    !layout ||
    !["observed-canvas-panel-path", "derived-hd-canvas-panel-path"]
      .includes(layout.state) ||
    !layout.referenceCanvas ||
    !finite([layout.referenceCanvas.width, layout.referenceCanvas.height]) ||
    layout.referenceCanvas.width! <= 0 ||
    layout.referenceCanvas.height! <= 0 ||
    !Array.isArray(layout.steps) ||
    layout.steps.length === 0
  ) return null;
  let parentWidth = layout.referenceCanvas.width!;
  let parentHeight = layout.referenceCanvas.height!;
  let matrix: Matrix2D = [1, 0, 0, 1, 0, 0];
  let width = parentWidth;
  let height = parentHeight;
  for (const step of layout.steps) {
    const rect = slotRect(step, parentWidth, parentHeight);
    if (!rect) return null;
    const local = stepMatrix(step, rect);
    if (!local) return null;
    matrix = multiply(matrix, local);
    parentWidth = rect.width;
    parentHeight = rect.height;
    width = rect.width;
    height = rect.height;
  }
  return {
    viewBox: [0, 0, layout.referenceCanvas.width!, layout.referenceCanvas.height!],
    width,
    height,
    matrix,
    transform: `matrix(${matrix.map((value) => Number(value.toFixed(8))).join(" ")})`,
  };
}
