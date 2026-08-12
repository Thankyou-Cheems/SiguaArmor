import * as THREE from "three";

function vectorKey(vector: THREE.Vector2) {
  return `${vector.x},${vector.y}`;
}

export function runtimeTextureCacheKey(texture: THREE.Texture) {
  const source = texture.source?.data as
    | { currentSrc?: string; src?: string }
    | undefined;
  const identity = source?.currentSrc || source?.src || texture.name;
  if (!identity) return null;
  return [
    identity,
    texture.colorSpace,
    texture.channel,
    texture.wrapS,
    texture.wrapT,
    texture.magFilter,
    texture.minFilter,
    texture.flipY,
    texture.premultiplyAlpha,
    texture.unpackAlignment,
    vectorKey(texture.offset),
    vectorKey(texture.repeat),
    vectorKey(texture.center),
    texture.rotation,
  ].join("|");
}

export function dedupeRuntimeSceneTextures(
  root: THREE.Object3D,
  cache: Map<string, THREE.Texture>,
) {
  let reused = 0;
  const disposed = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      const properties = material as unknown as Record<string, unknown>;
      for (const [property, value] of Object.entries(properties)) {
        if (!(value instanceof THREE.Texture)) continue;
        const key = runtimeTextureCacheKey(value);
        if (!key) continue;
        const existing = cache.get(key);
        if (!existing) {
          cache.set(key, value);
          continue;
        }
        if (existing === value) continue;
        properties[property] = existing;
        reused += 1;
        if (!disposed.has(value)) {
          value.dispose();
          disposed.add(value);
        }
      }
    }
  });
  return { unique: cache.size, reused };
}
