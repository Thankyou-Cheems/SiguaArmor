import vinext from "vinext";
import path from "node:path";
import { defineConfig } from "vite";

const publicDir = path.resolve(
  process.env.SIGUA_DEVELOPMENT_PUBLIC_DIR?.trim() ||
    process.env.SIGUA_RELEASE_PUBLIC_DIR?.trim() ||
    ".release/public",
);

export default defineConfig({
  publicDir,
  plugins: [vinext()],
  build: {
    manifest: true,
    assetsInlineLimit: 4096,
    minify: "esbuild",
    sourcemap: false,
    target: "es2022",
  },
});
