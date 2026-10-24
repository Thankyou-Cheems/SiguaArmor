import { wikiMapUrl } from './wiki-source.ts';

// Additive adapter. The current school renderer stays on its accepted Query
// bundle until the refreshed exact Query publication passes school acceptance.
export const schoolResourceScope = Object.freeze({
  id: 'narva-school', layerId: 'Narva_AAS_v1',
  boundsSourceCm: [9000, -58000, 19000, -46000],
});
export type SchoolViewQueryIdentity = {
  mapId: string; sourceBuild: string; layerId: string;
  manifestSha256: string; serverManifestHash: string;
};
type ViewSession = {
  view: {source: SchoolViewQueryIdentity; coverage: string; records: unknown[]; resources: unknown[]};
  resourceBytes(id: string): Promise<ArrayBuffer>;
};
type PreparedViewSession = {
  view: ViewSession['view'];
  resourceBytes(id: string): ArrayBuffer;
};
type ViewAlgorithm = {
  openMapResourceView(input: {
    entryUrl: string; objectBaseUrl: string; scope: typeof schoolResourceScope;
    fetchBytes(url: string, options: {cache: RequestCache}): Promise<ArrayBuffer>;
    sha256(bytes: ArrayBuffer): Promise<string>;
  }): Promise<ViewSession>;
  assertMapViewQuery(view: ViewSession['view'], query: SchoolViewQueryIdentity): void;
  prepareMapResourceView(session: ViewSession): Promise<PreparedViewSession>;
};
export async function loadSchoolResourceView(query: SchoolViewQueryIdentity, signal?: AbortSignal) {
  const moduleUrl = wikiMapUrl('/algorithms/maps/resource-view.js');
  const algorithm = await import(/* @vite-ignore */ moduleUrl) as ViewAlgorithm;
  const session = await algorithm.openMapResourceView({
    entryUrl: 'https://calc.siguad.icu/map-data/views/narva-school.json',
    objectBaseUrl: 'https://calc.siguad.icu/map-data/',
    scope: schoolResourceScope,
    async fetchBytes(url, options) {
      const response = await fetch(url, {...options, signal, credentials: 'omit'});
      if (!response.ok) throw new Error(`学校地图资源不可用：${response.status}`);
      return response.arrayBuffer();
    },
    async sha256(bytes) {
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
    },
  });
  algorithm.assertMapViewQuery(session.view, query);
  return algorithm.prepareMapResourceView(session);
}
