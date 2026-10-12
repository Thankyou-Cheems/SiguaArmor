// Source widths account for the existing per-faction scale; CSS canvas and baseline stay unchanged.
export function characterPortraitSizes(scale: number): string {
  const clampSize = (minimum: number, viewportWidth: number, maximum: number) =>
    `clamp(${minimum * scale}px, ${viewportWidth * scale}vw, ${maximum * scale}px)`;
  return [
    `(max-width: 680px) ${clampSize(138, 39, 178)}`,
    `(max-width: 1040px) ${clampSize(220, 28, 300)}`,
    clampSize(280, 26, 440),
  ].join(", ");
}

