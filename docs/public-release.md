# SiguaArmor public assets and release

## Ownership

This repository contains product code and browser-ready approved output. SiguaResearch
keeps research tools, raw/uncompressed assets, source locks, and evidence. SiguaWiki is
the continuing authority for reusable final data.

## Restore a checkout

The multi-gigabyte browser asset tree is ignored by Git. A fresh checkout restores it
with:

```powershell
npm ci
npm run assets:restore
npm run build
```

`public-assets.json` pins every archive and the resulting public manifest by byte count
and SHA-256. The first layer is a frozen GitHub Release used only as a low-frequency
developer/CI bootstrap. The production website never hotlinks it.

## Monthly asset changes

Do not upload another full GitHub archive. After Research approval:

1. publish only changed/new browser-ready files plus the new
   `public/release-manifest.json` in a tar.gz archive on the project-owned origin/CDN;
2. append its HTTPS URL, byte count, SHA-256, and result-manifest identity to
   `incrementalArchives` in `public-assets.json`;
3. update `preparedManifest` to the last layer's result manifest; and
4. run `npm run assets:restore`, the affected tests, and a full build.

The restore tool rejects GitHub-hosted incremental layers and resumes from the last
recognized manifest. Unchanged content-addressed files remain in the baseline, so each
monthly transfer contains only new bytes. A later compaction, if ever needed, belongs on
the project-owned CDN rather than GitHub.

## Production deployment

Builds prepare the exact public closure in `.release/public`. Production releases use
`release:delta` against the cache-busted live manifest, package only bytes absent from
the live baseline, preflight an isolated candidate, and activate atomically with a
rollback retained. See `docs/sops/lightweight-public-release.md` for the operational
steps.

The CDN serves content-addressed paths with long immutable caching. Mutable JSON and
HTML use short cache/revalidation. GitHub is source collaboration and bootstrap custody,
not the site origin, CDN, or a monthly binary distribution service.
