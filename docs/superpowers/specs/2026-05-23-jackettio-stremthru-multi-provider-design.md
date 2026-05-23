# Jackettio StremThru Multi-Provider Design

## Context

Jackettio currently searches torrents through Jackett, parses torrent metadata, and resolves playback through one selected debrid provider configured by `debridId` and `debridApiKey`. The existing debrid implementation is provider-specific, with separate classes for Debrid-Link, AllDebrid, Real-Debrid, and Premiumize.

The target change is a breaking config update. Existing install URLs that use `debridId` and `debridApiKey` do not need automatic migration. New installs should use the Nexio-Torii style `debridServices` array and route all debrid operations through StremThru.

## Goals

- Replace Jackettio's native debrid-provider boundary with a generic StremThru-backed provider layer.
- Support multiple configured debrid services in one install.
- Support the same service set as Nexio-Torii: RealDebrid, TorBox, AllDebrid, Premiumize, Debrid-Link, Debrider, EasyDebrid, Offcloud, and PikPak.
- Keep Jackettio's current Jackett search, torrent parsing, quality filtering, language prioritization, pack prioritization, private tracker passkey handling, MediaFlow handling, and existing error videos.
- Preserve and fix the cached-only option so `hideUncached` reliably hides uncached provider streams.
- Avoid exposing raw provider API keys as standalone URL path segments.

## Non-Goals

- Preserve old `debridId` / `debridApiKey` install URLs.
- Keep native provider API implementations active.
- Implement provider-specific API behavior outside StremThru.
- Add unrelated catalog, metadata, or Jackett search changes.
- Guarantee perfect episode selection for providers that do not return usable file metadata for cached torrents.

## Supported Service Registry

Define one backend registry for service IDs, display names, short labels, API key help links, and validation.

| Service ID | Short Label | Display Name |
| --- | --- | --- |
| `realdebrid` | `RD` | RealDebrid |
| `torbox` | `TB` | TorBox |
| `alldebrid` | `AD` | AllDebrid |
| `premiumize` | `PM` | Premiumize |
| `debridlink` | `DL` | Debrid-Link |
| `debrider` | `DB` | Debrider |
| `easydebrid` | `ED` | EasyDebrid |
| `offcloud` | `OC` | Offcloud |
| `pikpak` | `PP` | PikPak |

The configure page can consume this registry through the existing template config payload. If sharing the exact object between backend and frontend is awkward, duplicate only the minimum display metadata in the rendered template and keep backend validation authoritative.

## Configuration Model

New user config uses `debridServices`:

```json
{
  "debridServices": [
    { "service": "realdebrid", "apiKey": "..." },
    { "service": "premiumize", "apiKey": "..." }
  ],
  "hideUncached": true
}
```

Config normalization should:

- Merge regular Jackettio defaults with user config.
- Drop malformed `debridServices` entries.
- Drop unsupported service names.
- Trim empty API keys.
- Preserve multiple entries for the same service because they may be different accounts.
- Require at least one valid service for configured manifests and stream resolution.

The old `debridId` and `debridApiKey` keys are intentionally ignored.

## StremThru Provider Layer

Create a generic StremThru client that owns all debrid API calls. It should follow Nexio-Torii's endpoint model and adapt responses into Jackettio's existing file and stream shapes.

Core operations:

- `checkStoreTorz(hashes, serviceEntry, options)` calls `GET /v0/store/torz/check`.
- `addStoreTorz(magnetOrTorrent, serviceEntry, options)` adds or fetches a torrent through `POST /v0/store/torz`.
- `generateStoreLink(link, serviceEntry, options)` calls `POST /v0/store/torz/link/generate`.
- `checkStoreUser(serviceEntry, options)` can validate credentials or provide diagnostics when useful.
- `getUserHash(serviceEntry)` returns a stable non-secret account hash for download cache keys.

Each request sets:

- `X-StremThru-Store-Name: <service>`
- `X-StremThru-Store-Authorization: Bearer <apiKey>`
- `User-Agent: Jackettio/<version>`

The provider layer should implement request timeouts, chunk large hash checks, cache short-lived check results where useful, and cache temporary failures briefly enough to avoid repeated slow failures in one stream request.

StremThru files should map to Jackettio-compatible file objects:

```js
{
  id: file.index,
  index: file.index,
  name: file.name || file.path || "Unknown",
  path: file.path || file.name || "Unknown",
  size: file.size || 0,
  url: file.link || "",
  ready: isReady
}
```

## Stream Flow

`getStreams` should normalize user config and create service entries from `debridServices`. It should continue using the existing torrent discovery pipeline:

1. Load metadata.
2. Select Jackett indexers.
3. Search movie, episode, and pack torrents.
4. Apply quality, year, language, and exclude-keyword filters.
5. Fetch torrent info and dedupe by info hash.
6. Enforce private tracker passkey behavior for uncached private torrents.

After torrent info is available:

1. Build the unique info-hash list once.
2. Check StremThru cache availability for each configured service entry.
3. For each torrent and service entry, decide whether to emit a stream.
4. Mark cached streams when StremThru reports a ready cached item with usable files.
5. Skip cached series streams when file metadata does not include a matching episode file.
6. Emit uncached streams only when `hideUncached` is false.

Stream names should stay compact and provider-specific:

- Cached: `[RD+] Jackettio 1080p`
- Uncached: `[RD] Jackettio 1080p`

The existing title rows should remain mostly unchanged: torrent name, selected episode file where known, info text, size, seeders, indexer, languages, and progress when available.

## Cached-Only Behavior

`hideUncached` is the user-facing cached-only option and should be enforced per provider. If enabled, only streams that StremThru reports as cached and playable should be emitted.

If a provider cache check fails due to invalid credentials, rate limiting, timeout, or StremThru outage, that provider should produce no cached streams for the request. It should not cause uncached streams to appear when `hideUncached` is enabled.

This fixes the current behavior where cached filtering depends on provider-specific classes and a module-level `cacheCheckAvailable` shape that does not represent the selected provider.

## Download Flow

Playback URLs should carry:

- The opaque Base64 user config payload.
- The service entry index.
- The media type and Stremio ID.
- The torrent ID.
- An optional display filename.

Example:

```text
/:userConfig/download/:serviceIndex/:type/:id/:torrentId/:name?
```

The resolver should:

1. Decode config and normalize `debridServices`.
2. Select `debridServices[serviceIndex]`.
3. Load torrent info by `torrentId`.
4. Add or fetch the torrent through StremThru using the magnet when available.
5. For torrent-file-only indexer results, preserve Jackettio's private tracker passkey replacement before handing data to the StremThru layer. If StremThru cannot accept the torrent file directly, the implementation must disable that uncached torrent with a clear info message instead of exposing an unsafe or non-working stream.
6. Select the movie or episode file with Jackettio's existing `getFile` and `searchEpisodeFile` logic.
7. Generate the direct link through StremThru.
8. Apply MediaFlow proxy wrapping when enabled.
9. Cache the resolved download by service account hash, MediaFlow state, Stremio ID, torrent ID, and selected file identity.
10. Redirect to the generated URL.

If the torrent is still processing, return the existing `not_ready.mp4` path through the current error handling. Invalid credentials, non-premium accounts, access-denied states, and two-factor/account-lock states should map to existing Jackettio error videos where StremThru exposes enough status to classify them.

## Configure Page

Replace the single debrid provider selector with a repeatable provider list:

- Add provider.
- Select service.
- Enter API key.
- Remove provider.

Validation should require at least one provider with a supported service and non-empty API key. The page should continue to validate qualities, indexers, passkey format, and MediaFlow configuration. It should emit only the new `debridServices` shape.

The existing `hideUncached` switch remains in Filters & Sorts as "Display only cached torrents". Because this is now backed by StremThru cache checks for all supported providers, it should behave consistently across services.

## Manifest Behavior

Configured manifest names should include compact provider labels. For one provider, append `RD`. For multiple providers, append a concise joined label such as `RD+PM+TB`. If the label becomes too long, truncate to a small provider count summary such as `3 providers`.

Unconfigured manifests still return the current "configure this addon" stream behavior.

## Error Handling

Provider failures should be scoped to the affected service entry:

- Invalid key or expired subscription: skip that provider's streams and log a clear provider-scoped error.
- Rate limit or temporary StremThru failure: treat the provider as having no cached results for that request and cache the failure briefly.
- Uncached torrent clicked: add the torrent and return the waiting video when StremThru reports a pending state.
- Cached torrent without a playable file: return the generic error video or waiting video depending on StremThru status.
- Direct link generation failure: return an existing Jackettio error video.

Failures for one configured provider must not remove streams from other configured providers.

## Testing

Jackettio currently has no test script. Add a minimal Node test setup and focused tests for:

- Config normalization accepts supported services and drops malformed entries.
- The service registry exposes the expected Nexio-Torii provider set.
- StremThru torz check responses map cached files into Jackettio file objects.
- `hideUncached` removes uncached streams per provider.
- Multi-provider stream generation emits separate streams for each configured service.
- Download URL generation includes a provider index and does not expose raw API keys as path segments.
- Resolver selection uses `debridServices[serviceIndex]`.

Manual verification should cover:

- Configure RealDebrid plus Premiumize.
- Confirm manifest naming includes both provider labels.
- Confirm cached stream names show `[RD+]` and `[PM+]`.
- Confirm uncached streams are hidden when `hideUncached` is enabled.
- Confirm uncached streams are shown when `hideUncached` is disabled.
- Confirm a selected cached stream redirects to a direct StremThru-generated link.
- Confirm MediaFlow still wraps resolved links when enabled.

## Implementation Notes

- Prefer adapting Nexio-Torii's StremThru endpoint behavior, but implement it as ESM and with Jackettio's data shapes.
- Keep provider registry and config normalization small and testable.
- Do not include native provider credentials directly in route segments.
- Keep private tracker passkey handling in the same location in the torrent file flow so existing deployments with private trackers remain safe.
- Remove or stop importing obsolete provider-specific classes after the StremThru provider path is in place.
