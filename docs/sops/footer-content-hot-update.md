# Footer content hot update

The public footer reads two small same-origin documents at runtime:

- `public/supporters.json` owns the sponsor and friend-link list.
- `public/updates.json` owns the update log and the site date shown at the lower left.

After this feature has been deployed once, changing either document does not require a site build,
container restart, or release-directory cutover.

## Edit sponsors and friend links

Edit `public/supporters.json`. Array order is display order. `kind` is either `sponsor` or `friend`;
`url`, `note`, and `nameSegments` are optional, URLs must use HTTPS, and IDs are stable unique
lowercase slugs. When `nameSegments` is present, its text must concatenate exactly to `name`;
each segment uses a lowercase six-digit hex color.

```json
{
  "version": 1,
  "updatedAt": "2026-07-17T00:00:00.000Z",
  "entries": [
    {
      "id": "example-supporter",
      "name": "示例赞助者",
      "nameSegments": [
        {
          "text": "示例",
          "color": "#ffffff"
        },
        {
          "text": "赞助者",
          "color": "#e1c89b"
        }
      ],
      "kind": "sponsor",
      "url": "https://example.com/",
      "note": "感谢支持"
    }
  ]
}
```

Validate and publish:

```powershell
npm run supporters:publish -- --dry-run
npm run supporters:publish
```

## Edit the update log

Edit `public/updates.json`. Keep entries newest-first. The publisher replaces `updatedAt` and
`siteUpdatedOn` automatically, so the lower-left site date follows the day on which the log is
published.

```json
{
  "version": 1,
  "updatedAt": "2026-07-17T00:00:00.000Z",
  "siteUpdatedOn": "2026-07-17",
  "entries": [
    {
      "id": "2026-07-17-example",
      "date": "2026-07-17",
      "title": "示例更新",
      "items": [
        "第一项更新内容。"
      ]
    }
  ]
}
```

Validate and publish:

```powershell
npm run updates:publish -- --dry-run
npm run updates:publish
```

## Publication and recovery

Both commands validate the canonical schema, atomically replace only the selected server file,
purge only its exact EdgeOne URL, and verify the public response digest. They use the existing
`TencentCloudPublic` SSH alias and local Tencent Cloud CLI credentials. Override the defaults with
`SIGUA_DEPLOY_SSH_HOST`, `SIGUA_EDGEONE_ZONE_ID`, or `SIGUA_PUBLIC_ORIGIN` when required.

If Tencent Cloud CLI is unavailable, add `--no-purge`; the 60-second CDN TTL still publishes the
change without rebuilding the site. To recover, restore the desired JSON from Git history and run
the corresponding publish command again.
