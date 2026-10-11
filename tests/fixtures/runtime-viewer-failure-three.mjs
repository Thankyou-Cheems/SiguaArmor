// Exercise the real viewer lifecycle without requiring a GPU in the test runner.
export * from "three";
export class WebGLRenderer {
  constructor() {
    const probe = globalThis.__viewerFailureProbe;
    probe.attempts++;
    if (probe.failure === "constructor") throw new Error("Test WebGL initialization failure");
    this.probe = probe;
    this.domElement = document.createElement("canvas");
    this.renderLists = { dispose: () => { probe.renderListDisposals++; } };
    probe.canvases.push(this.domElement);
  }
  getContext() { return { isContextLost: () => false, getExtension: () => null }; }
  setClearColor() {}
  setPixelRatio() {
    if (this.probe.failure === "configuration") throw new Error("Test renderer configuration failure");
  }
  setSize() { if (this.probe.failure === "initial-resize") throw new Error("Test initial resize failure"); }
  render() { this.probe.renders++; }
  setAnimationLoop() { this.probe.animationStops++; }
  dispose() { this.probe.disposals++; }
  forceContextLoss() { this.probe.contextLosses++; }
}
