import {
  canonicalPublicFactionValue,
  preparePublicFactionCatalogInflation,
  PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION,
  samePublicFactionValue,
} from "./public-faction-reference-graph.mjs";

export {
  PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION,
  samePublicFactionValue,
};

const textEncoder = new TextEncoder();

function base64Url(digest: Uint8Array) {
  return globalThis
    .btoa(String.fromCharCode(...digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

async function digest(domain: string, value: unknown) {
  const bytes = textEncoder.encode(
    `${domain}${canonicalPublicFactionValue(value)}`,
  );
  return base64Url(
    new Uint8Array(
      await globalThis.crypto.subtle.digest("SHA-256", bytes),
    ),
  );
}

export async function inflatePublicFactionCatalogInBrowser<
  T = unknown,
>(document: unknown): Promise<T> {
  const prepared =
    preparePublicFactionCatalogInflation(document);
  for (const assertion of prepared.digestAssertions) {
    if (
      (await digest(assertion.domain, assertion.value)) !==
      assertion.expected
    ) {
      throw new Error(
        `Invalid public faction catalog: ${assertion.message}`,
      );
    }
  }
  return prepared.value as T;
}
