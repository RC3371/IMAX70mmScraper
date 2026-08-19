# The Odyssey IMAX 70mm Watcher

Read-only Cloudflare Worker that watches **Regal Hacienda Crossings** (Dublin, CA) for **The Odyssey (2026) — IMAX 70mm** showtimes on a set of target weekends, and alerts via ntfy / Discord / email the moment a new qualifying one appears.

**What qualifies:** a show on one of the watched weekends (`WATCH_DATES` in [src/config.ts](src/config.ts) — currently Sep 25–27, Oct 2–4, 9–11, 16–18, 23–25) where **Friday shows start at/after 3:00 PM** (`FRIDAY_EARLIEST`) and **Saturday/Sunday shows qualify any time**. Add weekends by extending `WATCH_DATES`.

## How it works

- **Single source: Fandango's internal JSON** for Hacienda (`/napi/theaterMovieShowtimes/AAOPK`), with a cookie-prime request first. Verified working server-side; Regal's own site hard-blocks non-browser traffic. (Metreon and the AMC path from earlier movie configs were dropped — this watches one theater.)
- Each run fetches the 15 watched dates, filters to **The Odyssey + IMAX 70MM + non-expired**, then applies the weekend/time rule. `odysseyShowsFound` (any 70mm show in the window) is an informational health hint; the real failure signal is a non-empty `errors[]` (a Fandango 403/timeout). Zero shows is normal until the booking window reaches these dates.
- **Politeness throttle:** the cron fires every 2 min but scheduled runs actually hit Fandango at most every ~12 min (`FETCH_MIN_INTERVAL_MS`); manual `/api/refresh` bypasses it.
- **Seed on cutover** so already-listed qualifying shows don't all alert on run 1 — then only genuinely new ones fire.
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
# Seed the seen-set once (absorbs any already-listed qualifying shows so only
# genuinely new ones alert):
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
