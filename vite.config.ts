import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vinext()],
  build: {
    manifest: true,
    assetsInlineLimit: 4096,
    minify: "esbuild",
    sourcemap: false,
    target: "es2022",
  },
});
