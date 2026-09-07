export function percentile(values, quantile) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(quantile * sorted.length) - 1),
  );
  return sorted[index];
}

export function summarizeFrameIntervals(intervals) {
  const finite = intervals.filter((value) => Number.isFinite(value) && value >= 0);
  return {
    samples: finite.length,
    medianMs: percentile(finite, 0.5),
    p95Ms: percentile(finite, 0.95),
    maxMs: finite.length > 0 ? Math.max(...finite) : null,
    over32Ms: finite.filter((value) => value > 32).length,
    over50Ms: finite.filter((value) => value > 50).length,
  };
}

export function evaluateRuntimeViewerBudget(report, budget) {
  const failures = [];
  const renderer = report.browser?.pageRenderer ?? report.browser?.glRenderer ?? "";
  if (!new RegExp(budget.expectedRenderer, "iu").test(renderer)) {
    failures.push(`renderer ${JSON.stringify(renderer)} does not match ${budget.expectedRenderer}`);
  }
  if (report.viewer?.renderQuality !== "compatibility") {
    failures.push(`render quality is ${report.viewer?.renderQuality ?? "missing"}, expected compatibility`);
  }
  if ((report.viewer?.optimizedAssetCount ?? 0) < budget.minOptimizedAssets) {
    failures.push(
      `optimized assets ${report.viewer?.optimizedAssetCount ?? 0} < ${budget.minOptimizedAssets}`,
    );
  }
  if (report.readyMs > budget.maxReadyMs) {
    failures.push(`ready ${report.readyMs.toFixed(1)}ms > ${budget.maxReadyMs}ms`);
  }
  if ((report.drag?.frames?.p95Ms ?? Number.POSITIVE_INFINITY) > budget.maxDragP95Ms) {
    failures.push(
      `drag p95 ${report.drag?.frames?.p95Ms ?? "missing"}ms > ${budget.maxDragP95Ms}ms`,
    );
  }
  if ((report.drag?.frames?.maxMs ?? Number.POSITIVE_INFINITY) > budget.maxDragMaxMs) {
    failures.push(
      `drag max ${report.drag?.frames?.maxMs ?? "missing"}ms > ${budget.maxDragMaxMs}ms`,
    );
  }
  if ((report.drag?.longTasks?.length ?? 0) > budget.maxLongTasks) {
    failures.push(
      `drag long tasks ${report.drag?.longTasks?.length ?? 0} > ${budget.maxLongTasks}`,
    );
  }
  if ((report.drag?.contextLosses ?? 0) > budget.maxContextLosses) {
    failures.push(
      `WebGL context losses ${report.drag?.contextLosses ?? 0} > ${budget.maxContextLosses}`,
    );
  }
  if ((report.network?.failures?.length ?? 0) > 0) {
    failures.push(`network failures: ${report.network.failures.length}`);
  }
  if ((report.network?.forbiddenCatalogRequests?.length ?? 0) > 0) {
    failures.push(
      `default 3D requested full catalogs: ${report.network.forbiddenCatalogRequests.length}`,
    );
  }
  if ((report.network?.forbiddenWeaponImpressionRequests?.length ?? 0) > 0) {
    failures.push(
      `Armor requested Wiki weapon impression assets: ${report.network.forbiddenWeaponImpressionRequests.length}`,
    );
  }
  if ((report.consoleErrors?.length ?? 0) > 0) {
    failures.push(`console errors: ${report.consoleErrors.length}`);
  }
  return { pass: failures.length === 0, failures };
}
