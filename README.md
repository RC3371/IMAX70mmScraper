# Dune: Part Three IMAX 70mm Watcher

Read-only Cloudflare Worker that watches **AMC Metreon 16** and **Regal Hacienda Crossings** for **Dune: Part Three (2026) — IMAX 70mm** showtimes dated **2026-12-17 or later** (PT) and alerts via ntfy / Discord / email the moment a new one appears. This catches two things at once: **extra showtimes added to the listed Dec 17–20 previews**, and the **still-unannounced Dec 21+ block**.

## How it works

- **Primary source (both theaters): Fandango's internal JSON** (`/napi/theaterMovieShowtimes/{AANEM|AAOPK}`), with a cookie-prime request first. Verified working server-side; Regal's own site hard-blocks non-browser traffic, and AMC's GraphQL is bot-walled.
- **Second signal (Metreon): AMC's SSR showtimes HTML** — parsed for Dune `imax70mm` showtimes; throttled to ~10 min. **Currently dormant**: AMC's site is behind a Queue-It wall (302 → `queue.amctheatres.com`), so this path logs `queue-walled` and Fandango is the sole working source.
- Each run scans **Dec 17–24** (the 4 listed preview days plus the leading edge of the unannounced block). **Dec 17 doubles as the health canary** (known-positive, 2 shows/theater): a zero canary count means the pipeline broke, not that there's no drop — surfaced on the status page and logs.
- **Seeding is mandatory** before going live: the current Dec 17–20 shows are already listed, so the seed absorbs them and only genuine additions / new dates alert.
- Cron fires every 2 min; fetches actually run every 15 min baseline, every 2 min during hot windows (00:00–09:00 PT and all day Thu/Fri), every tick during an optional `BLITZ_START`/`BLITZ_END` window. Runs are jittered 0–15 s.
- Seen-set + notified-guard in KV → exactly one alert per new performance.

## Deploy (one-time)

```sh
npx wrangler login
npx wrangler kv namespace create WATCHER_KV   # copy the id into wrangler.toml
npx wrangler deploy
# optional alert channels (each is skipped if unset):
npx wrangler secret put NTFY_TOPIC
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ALERT_EMAIL
# REQUIRED — seed the seen-set once (absorbs the listed Dec 17–20 shows so only
# genuine additions / new dates alert). Skipping this fires ~16 alerts on run 1:
curl -X POST https://<your-worker-url>/api/seed
# verify alerts end-to-end:
curl -X POST https://<your-worker-url>/api/test-alert
```

### Repointing an already-deployed watcher (e.g. from a previous movie)

```sh
npx wrangler deploy
npx wrangler kv key delete --binding=WATCHER_KV "seen:performances"  # drop stale state
curl -X POST https://<your-worker-url>/api/seed                       # re-seed for the new target
```
Existing ntfy/Discord/Resend secrets carry over — no need to re-set them.

## Endpoints

- `GET /` — status page + Refresh button
- `GET /api/status` — last-run metadata JSON
- `POST /api/refresh` — run a check now (rate-limited 1/10 s)
- `POST /api/seed` — one-time seen-set seeding
- `POST /api/test-alert` — synthetic alert through all configured channels

## Dev

```sh
npm i
npm test          # vitest — includes the golden dedup test
npx wrangler dev  # local; POST /api/refresh does live fetches
npx wrangler tail # logs on the deployed worker
```
