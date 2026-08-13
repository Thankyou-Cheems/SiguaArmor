import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { runtimeWikiAssetUrl } from "./runtime-visual-lazy-load.ts";

export interface RawRuntimeHitBufferRef {
  encoding: "raw";
  url: string;
  decodedByteLength: number;
  decodedSha256: string;
}

export interface MeshoptV1RuntimeHitBufferChunk {
  sourceByteOffset: number;
  sourceByteLength: number;
  decodedByteOffset: number;
  decodedByteLength: number;
  decodedByteStride: 2 | 4 | 12;
  count: number;
  byteStride: 4 | 12;
  mode: "ATTRIBUTES";
  filter: "NONE";
}

export interface MeshoptV1RuntimeHitBufferRef {
  encoding: "meshopt-v1";
  url: string;
  decodedByteLength: number;
  decodedSha256: string;
  chunks: readonly MeshoptV1RuntimeHitBufferChunk[];
}

export type RuntimeHitBufferRef =
  | RawRuntimeHitBufferRef
  | MeshoptV1RuntimeHitBufferRef;

export interface RuntimeHitBufferDecoder {
  readonly ready: Promise<unknown>;
  decodeGltfBuffer(
    target: Uint8Array,
    count: number,
    byteStride: number,
    source: Uint8Array,
    mode: "ATTRIBUTES",
    filter: "NONE",
  ): void;
}

export interface RuntimeHitBufferLoaderOptions {
  read?: (url: string) => Promise<ArrayBuffer>;
  meshoptDecoder?: RuntimeHitBufferDecoder;
}

export type RuntimeHitBufferSource = ArrayBuffer | PromiseLike<ArrayBuffer>;

export interface RuntimeHitBufferLoader {
  load(
    ref: RuntimeHitBufferRef,
    source?: RuntimeHitBufferSource,
  ): Promise<ArrayBuffer>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid hit buffer: ${message}`);
}

function assertRuntimeAssetUrl(url: string) {
  assert(
    /^\/[A-Za-z0-9_./-]+$/.test(url) && !url.includes(".."),
    "URL is unsafe",
  );
}

function assertDecodedIntegrity(ref: RuntimeHitBufferRef) {
  assertRuntimeAssetUrl(ref.url);
  assert(
    Number.isSafeInteger(ref.decodedByteLength) && ref.decodedByteLength >= 0,
    "decoded byte length is invalid",
  );
  assert(/^[0-9a-f]{64}$/.test(ref.decodedSha256), "decoded SHA-256 is invalid");
}

async function readRuntimeHitBuffer(url: string): Promise<ArrayBuffer> {
  assertRuntimeAssetUrl(url);
  const response = await fetch(runtimeWikiAssetUrl(url), { cache: "force-cache" });
  assert(response.ok, `request returned HTTP ${response.status}`);
  return response.arrayBuffer();
}

function validateMeshoptChunks(ref: MeshoptV1RuntimeHitBufferRef, source: ArrayBuffer) {
  assert(ref.chunks.length > 0, "meshopt chunks are missing");
  const decodedRanges = ref.chunks.map((chunk, index) => {
    assert(
      Number.isSafeInteger(chunk.sourceByteOffset) && chunk.sourceByteOffset >= 0,
      `meshopt chunk ${index} source offset is invalid`,
    );
    assert(
      Number.isSafeInteger(chunk.sourceByteLength) && chunk.sourceByteLength > 0,
      `meshopt chunk ${index} source length is invalid`,
    );
    assert(
      chunk.sourceByteOffset + chunk.sourceByteLength <= source.byteLength,
      `meshopt chunk ${index} exceeds its artifact`,
    );
    assert(
      Number.isSafeInteger(chunk.decodedByteOffset) && chunk.decodedByteOffset >= 0,
      `meshopt chunk ${index} decoded offset is invalid`,
    );
    assert(
      Number.isSafeInteger(chunk.decodedByteLength) && chunk.decodedByteLength > 0,
      `meshopt chunk ${index} decoded length is invalid`,
    );
    assert(
      Number.isSafeInteger(chunk.count) && chunk.count > 0,
      `meshopt chunk ${index} count is invalid`,
    );
    assert(
      chunk.byteStride === 4 || chunk.byteStride === 12,
      `meshopt chunk ${index} encoded stride is invalid`,
    );
    assert(
      [2, 4, 12].includes(chunk.decodedByteStride) &&
        chunk.decodedByteStride <= chunk.byteStride,
      `meshopt chunk ${index} decoded stride is invalid`,
    );
    assert(
      chunk.count * chunk.decodedByteStride === chunk.decodedByteLength,
      `meshopt chunk ${index} decoded stride does not match decoded length`,
    );
    assert(chunk.mode === "ATTRIBUTES", `meshopt chunk ${index} mode is unsupported`);
    assert(chunk.filter === "NONE", `meshopt chunk ${index} filter is unsupported`);
    assert(
      chunk.decodedByteOffset + chunk.decodedByteLength <= ref.decodedByteLength,
      `meshopt chunk ${index} exceeds decoded buffer`,
    );
    return {
      start: chunk.decodedByteOffset,
      end: chunk.decodedByteOffset + chunk.decodedByteLength,
    };
  }).sort((left, right) => left.start - right.start);

  let expectedOffset = 0;
  for (const range of decodedRanges) {
    assert(range.start === expectedOffset, "meshopt decoded chunks are not contiguous");
    expectedOffset = range.end;
  }
  assert(expectedOffset === ref.decodedByteLength, "meshopt decoded chunks do not fill the buffer");
}

async function decodeMeshoptV1(
  ref: MeshoptV1RuntimeHitBufferRef,
  source: ArrayBuffer,
  meshoptDecoder: RuntimeHitBufferDecoder,
): Promise<ArrayBuffer> {
  validateMeshoptChunks(ref, source);
  await meshoptDecoder.ready;
  const decoded = new Uint8Array(ref.decodedByteLength);
  for (const chunk of ref.chunks) {
    const destination = decoded.subarray(
      chunk.decodedByteOffset,
      chunk.decodedByteOffset + chunk.decodedByteLength,
    );
    const decodedStreamByteLength = chunk.count * chunk.byteStride;
    const target = chunk.decodedByteStride === chunk.byteStride
      ? destination
      : new Uint8Array(decodedStreamByteLength);
    const compressed = new Uint8Array(
      source,
      chunk.sourceByteOffset,
      chunk.sourceByteLength,
    );
    meshoptDecoder.decodeGltfBuffer(
      target,
      chunk.count,
      chunk.byteStride,
      compressed,
      "ATTRIBUTES",
      "NONE",
    );
    if (target !== destination) {
      for (let index = 0; index < chunk.count; index += 1) {
        destination.set(
          target.subarray(
            index * chunk.byteStride,
            index * chunk.byteStride + chunk.decodedByteStride,
          ),
          index * chunk.decodedByteStride,
        );
      }
    }
  }
  return decoded.buffer;
}

async function decodedSha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function createRuntimeHitBufferLoader(
  options: RuntimeHitBufferLoaderOptions = {},
): RuntimeHitBufferLoader {
  const read = options.read ?? readRuntimeHitBuffer;
  const meshoptDecoder = options.meshoptDecoder ?? MeshoptDecoder;
  const inFlightByDecodedSha256 = new Map<string, Promise<ArrayBuffer>>();

  return {
    load(ref, source) {
      try {
        assertDecodedIntegrity(ref);
      } catch (error) {
        return Promise.reject(error);
      }
      const existing = inFlightByDecodedSha256.get(ref.decodedSha256);
      if (existing) return existing;

      const pending = (async () => {
        const encoded = await (source ?? read(ref.url));
        assert(encoded instanceof ArrayBuffer, "source is not an ArrayBuffer");
        const decoded = ref.encoding === "raw"
          ? encoded
          : await decodeMeshoptV1(ref, encoded, meshoptDecoder);
        assert(
          decoded.byteLength === ref.decodedByteLength,
          "decoded byte length does not match",
        );
        assert(
          await decodedSha256(decoded) === ref.decodedSha256,
          "decoded SHA-256 does not match",
        );
        return decoded;
      })();
      inFlightByDecodedSha256.set(ref.decodedSha256, pending);
      const clearInFlight = () => {
        if (inFlightByDecodedSha256.get(ref.decodedSha256) === pending) {
          inFlightByDecodedSha256.delete(ref.decodedSha256);
        }
      };
      pending.then(clearInFlight, clearInFlight);
      return pending;
    },
  };
}

export const runtimeHitBufferLoader = createRuntimeHitBufferLoader();
