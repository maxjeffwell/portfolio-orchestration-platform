# Stremio NAS Addon — Design

**Date:** 2026-06-11
**Status:** Approved
**Repo home:** `docker/stremio-nas-addon/` (code + Dockerfile), `k8s/stremio-nas-addon/` (manifests, manual-apply)

## Goal

A self-hosted Stremio addon that exposes the ASUSTOR NAS media library
(`/volume1/Movies`, `/volume1/TV Shows`) to all Stremio clients:

1. **Catalog rows** — "NAS Movies" and "NAS TV" appear on the Stremio home
   screen and are searchable.
2. **Stream merge** — files matched to IMDB ids appear as "📂 Play from NAS"
   sources on the normal Cinemeta title pages.
3. **Direct file serving** — the addon itself serves video bytes with HTTP
   Range support. No transcoding.

## Non-goals

- Jellyfin-Recordings / volume2 Recordings exports (can be added later as
  more roots).
- Transcoding or subtitle extraction.
- Public internet exposure.

## Service implementation

Single Node.js (node:22-alpine) service, **no framework, no runtime deps** —
the addon protocol is ~5 JSON GET routes plus CORS. ~400 lines in
`server.js`. Image built and pushed manually as
`maxjeffwell/stremio-nas-addon` (same workflow as `influxdb-backup`).

### Scanner / matcher

- Runs at startup and every 12 h (`setInterval`).
- Walks `/media/movies` and `/media/tv` (read-only NFS mounts) for
  `mkv|mp4|avi|m4v|ts|webm`.
- Filename parsing:
  - Movies: `Title (Year).ext` and `Title.Year.junk.ext` forms → title + year.
  - TV: show name from the top-level directory; episodes from `SxxEyy`,
    `1x05`, or `Season N/` + episode-number patterns.
- IMDB matching via Cinemeta public search
  (`https://v3-cinemeta.strem.io/catalog/{movie|series}/top/search=<title>.json`):
  normalized-title equality required, year ±1 as tiebreaker. Returns IMDB id
  + poster.
- **Id scheme:** matched → `tt…` (shared id space with Cinemeta = stream
  merge works). Unmatched → `nas:<hash>` with filename-derived metadata so
  every file is still browsable.
- Index + per-(title, year) match cache persisted as JSON on a 1 Gi
  local-path PVC; rescans only re-query Cinemeta for unseen titles.

### HTTP API (port 7000, CORS `*` on everything)

| Route | Behavior |
|---|---|
| `/manifest.json` | catalogs `nas-movies` (movie) + `nas-tv` (series), both with `search` extra; resources `catalog`, `meta`, `stream`; `idPrefixes: ["tt", "nas:"]` |
| `/catalog/movie/nas-movies.json` (+`/search=…`) | movie metas from index |
| `/catalog/series/nas-tv.json` (+`/search=…`) | series metas from index |
| `/meta/<type>/<id>.json` | only answers `nas:` ids (Cinemeta owns `tt` meta); series meta includes episode `videos` array |
| `/stream/movie/<id>.json` | stream objects if id in index, else `{streams: []}` |
| `/stream/series/<id>:<s>:<e>.json` | same, per episode |
| `/file/<urlsafe-b64-relpath>` | Range-aware video streaming |

Each stream answer returns **two entries** — tailnet HTTPS URL and LAN HTTP
URL — because the addon cannot know which network the player is on; the user
picks the row that works.

### File streamer safety & semantics

- Decoded path must resolve (after `path.resolve`) inside one of the media
  roots; otherwise 404. No symlink following outside roots
  (`realpath` check).
- `Range` honored (single range, 206 + `Content-Range`), `Accept-Ranges:
  bytes`, `Content-Type` by extension, HEAD supported.

### Error handling

- NFS unreachable during rescan → keep last good index (PVC), log, retry next
  cycle.
- Cinemeta unreachable → affected titles stay/become `nas:` ids; retried next
  rescan (match cache only stores positive results).
- Unknown id on `/stream` → `{streams: []}`.

## Deployment (k8s, namespace `stremio-nas-addon`)

Mirrors the proven `k8s/stremio/stremio.yaml` pattern:

- **Deployment** (1 replica, `strategy: Recreate`), pinned
  `kubernetes.io/hostname: debian-marmoset` (LAN-local to the NAS — video
  bytes never cross the WG WAN).
  - `addon` container: port 7000 + **hostPort 7010** (LAN HTTP:
    `http://192.168.50.152:7010`). Env: `PUBLIC_HTTPS_BASE=https://nas-addon.tailnet.el-jefe.me`,
    `PUBLIC_LAN_BASE=http://192.168.50.152:7010`.
  - `tls-proxy` nginx sidecar: 8443, certs from `stremio-nas-addon-tls`.
  - `tailscale` userspace sidecar: `TS_HOSTNAME=nas-addon`,
    `TS_SERVE_CONFIG` raw-TCP 443 → nginx, authkey from Doppler via
    ExternalSecret, state in `nas-addon-tailscale-state` secret (SA + Role
    like stremio's).
- **Volumes:** NFS RO `192.168.50.133:/volume1/Movies` → `/media/movies`,
  `192.168.50.133:/volume1/TV Shows` → `/media/tv`; PVC `addon-cache`
  (local-path, 1 Gi) → `/data`.
- **Certificate:** `nas-addon.tailnet.el-jefe.me` via `letsencrypt-prod-dns`.
- **Service:** ClusterIP 7000 (cluster-internal convenience only).

Client install URLs:
- Tailnet: `https://nas-addon.tailnet.el-jefe.me/manifest.json`
- LAN: `http://192.168.50.152:7010/manifest.json` (desktop/Android accept
  http; the web client requires the tailnet URL)

## Testing

1. **Unit:** filename parser against a table of real-world names (node
   built-in `node:test`); path-safety tests for the file route (traversal,
   b64 junk, symlink escape).
2. **Integration (post-deploy):** `curl` manifest/catalog/stream routes;
   `Range: bytes=0-1023` returns 206 with correct `Content-Range`.
3. **End-to-end:** install manifest in a Stremio client; confirm catalog
   rows, a matched title shows the NAS source on its Cinemeta page, and
   playback + seeking work on both URLs.

## Risks / accepted trade-offs

- Cinemeta search matching is heuristic; mismatches possible for odd
  filenames. Mitigation: strict normalized-title equality + year check;
  unmatched falls back to `nas:` ids rather than wrong matches.
- hostPort 7010 must not collide on debian-marmoset (Channels standby uses
  8089; verify before apply).
- `idPrefixes: ["tt"]` means Stremio queries this addon for *every* title
  the user opens — answers must be fast; index is in-memory, so this is a
  map lookup returning `[]`.
