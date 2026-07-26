const ZOOM_FORMATTER = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 1,
});

export function formatZoomLevel(value) {
  return `${ZOOM_FORMATTER.format(value)}×`;
}
