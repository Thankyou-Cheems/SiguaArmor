interface VehicleViewerLoadingProps {
  vehicleName?: string;
  onClose?: () => void;
  embedded?: boolean;
}

export function VehicleViewerLoading({
  vehicleName,
  onClose,
  embedded = false,
}: VehicleViewerLoadingProps) {
  return (
    <div
      className={`vehicle-viewer vehicle-viewer--loading vehicle-viewer--data-loading${
        embedded ? " vehicle-viewer--data-loading-overlay" : ""
      }`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-embedded={embedded}
      aria-label={`正在加载${vehicleName ?? "载具"} 3D 数据`}
    >
      <div className="viewer-data-loader__ambient" aria-hidden="true" />
      <div className="viewer-data-loader__content">
        <div className="viewer-data-loader__visual" aria-hidden="true">
          <span className="viewer-data-loader__halo" />
          <span className="viewer-data-loader__wave-mask">
            <i className="viewer-data-loader__wave viewer-data-loader__wave--rear" />
            <i className="viewer-data-loader__wave viewer-data-loader__wave--front" />
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element -- shared transparent local derivative is also used by the help trigger */}
          <img src="/images/site/vehicle-crew-help.webp" alt="" />
          <span className="viewer-data-loader__scan" />
        </div>

        <div className="viewer-data-loader__copy">
          <span className="viewer-data-loader__eyebrow">
            <i aria-hidden="true" />
            载具数据链路
          </span>
          <strong>正在载入{vehicleName ? ` ${vehicleName}` : " 3D 场景"}</strong>
          <span>正在从就近节点接收模型、装甲与材质清单</span>
          <div className="viewer-data-loader__progress" aria-hidden="true">
            <i />
          </div>
          <small>首次加载可能需要片刻</small>
        </div>
      </div>

      {onClose ? (
        <button className="viewer-close" type="button" onClick={onClose} aria-label="关闭载具详情">
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </div>
  );
}
