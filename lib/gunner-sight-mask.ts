import type { GunnerSightLayerPlacement } from "./gunner-sight-layout";

/** A closed frame needs both a covered perimeter and a transparent viewing aperture.
 * Role/dimensions alone also match open reticles and opaque instrument images.
 */
export function gunnerSightMaskHasClosedFrame(
  boundaryPixels: ArrayLike<number>,
  aperturePixels: ArrayLike<number>,
): boolean {
  if (boundaryPixels.length < 4) return false;
  for (let i = 3; i < boundaryPixels.length; i += 4) {
    // Several real CROWS/TOW rims are translucent (alpha 194–224).
    if (boundaryPixels[i] < 128) return false;
  }
  for (let i = 3; i < aperturePixels.length; i += 4) {
    if (aperturePixels[i] <= 8) return true;
  }
  return false;
}

/** Source rectangle in the common 1920×1080 UMG canvas, including live rotation. */
export function gunnerSightMaskPolygon(
  placement: Pick<GunnerSightLayerPlacement, "viewBox" | "width" | "height" | "matrix">,
  angleDegrees = 0,
  pivot = { X: 0.5, Y: 0.5 },
): Array<[number, number]> {
  const { width, height, matrix: [a, b, c, d, e, f] } = placement;
  const [originX, originY, canvasWidth, canvasHeight] = placement.viewBox;
  const radians = angleDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const px = width * pivot.X;
  const py = height * pivot.Y;
  return [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => {
    const rx = px + (x - px) * cosine - (y - py) * sine;
    const ry = py + (x - px) * sine + (y - py) * cosine;
    return [
      (a * rx + c * ry + e - originX) * 1920 / canvasWidth,
      (b * rx + d * ry + f - originY) * 1080 / canvasHeight,
    ];
  });
}

const frameClassifications = new Map<string, Promise<boolean>>();

/** Reuse the already distributed texture. Read only its four one-pixel rims and
 * a small aperture sample, once per URL; no full-size readback or per-frame work.
 */
export function loadGunnerSightMaskFrame(url: string): Promise<boolean> {
  const cached = frameClassifications.get(url);
  if (cached) return cached;
  const classification = new Promise<boolean>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onerror = () => reject(new Error("Sight frame image unavailable"));
    image.onload = () => {
      try {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Sight frame pixel inspection unavailable");
        const boundary = new Uint8ClampedArray((width + height) * 8);
        let offset = 0;
        for (const [sx, sy, sw, sh] of [
          [0, 0, width, 1], [0, height - 1, width, 1],
          [0, 0, 1, height], [width - 1, 0, 1, height],
        ]) {
          canvas.width = sw;
          canvas.height = sh;
          context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
          const pixels = context.getImageData(0, 0, sw, sh).data;
          boundary.set(pixels, offset);
          offset += pixels.length;
        }
        canvas.width = 64;
        canvas.height = 64;
        context.drawImage(image, 0, 0, 64, 64);
        resolve(gunnerSightMaskHasClosedFrame(
          boundary, context.getImageData(0, 0, 64, 64).data,
        ));
      } catch (error) {
        reject(error);
      }
    };
    image.src = url;
  }).catch(() => {
    // A failed/CORS-blocked inspection must not obscure the original artwork.
    frameClassifications.delete(url);
    return false;
  });
  frameClassifications.set(url, classification);
  return classification;
}
