import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  dedupeRuntimeSceneTextures,
  runtimeTextureCacheKey,
} from "../../lib/runtime-texture-dedupe.ts";

function texture(src, colorSpace = THREE.SRGBColorSpace) {
  const value = new THREE.Texture({ src });
  value.colorSpace = colorSpace;
  return value;
}

function mesh(map) {
  return new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ map }),
  );
}

test("identical textures from separate GLTF scenes share one WebGL texture", () => {
  const firstTexture = texture("https://wiki.siguad.icu/shared.webp");
  const duplicateTexture = texture("https://wiki.siguad.icu/shared.webp");
  const first = mesh(firstTexture);
  const duplicate = mesh(duplicateTexture);
  const cache = new Map();

  assert.deepEqual(dedupeRuntimeSceneTextures(first, cache), {
    unique: 1,
    reused: 0,
  });
  assert.deepEqual(dedupeRuntimeSceneTextures(duplicate, cache), {
    unique: 1,
    reused: 1,
  });
  assert.equal(duplicate.material.map, firstTexture);
});

test("different color spaces or transforms remain separate texture objects", () => {
  const srgb = texture("https://wiki.siguad.icu/shared.webp");
  const linear = texture(
    "https://wiki.siguad.icu/shared.webp",
    THREE.NoColorSpace,
  );
  const transformed = texture("https://wiki.siguad.icu/shared.webp");
  transformed.repeat.set(2, 2);
  assert.notEqual(runtimeTextureCacheKey(srgb), runtimeTextureCacheKey(linear));
  assert.notEqual(runtimeTextureCacheKey(srgb), runtimeTextureCacheKey(transformed));
});
