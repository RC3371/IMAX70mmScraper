# CLAUDE.md — Dune: Part Three IMAX 70mm Ticket Watcher

Project instructions for Claude Code. Read this fully before writing code.

> **Build reality (as shipped):** the working source is **Fandango's internal JSON for both theaters** — not the AMC API / Regal scrape this doc originally proposed (no AMC vendor key was granted; Regal-direct and, as of the Dune repurpose, AMC's own site are bot/queue-walled). See [README.md](README.md) for the as-built source strategy; §4 below is retained as background.

## 1. What this is

A personal, read-only monitor that watches two theaters for **Dune: Part Three (2026, Denis Villeneuve) in IMAX 70mm** and alerts the owner the moment a **new** IMAX 70mm showtime dated **December 17, 2026 or later** appears for sale. Two distinct goals, one mechanism:
1. **New dates** — the **Dec 21+** block is not yet announced; catch it on first appearance.
2. **Additions** — the **Dec 17–20** preview/opening days are already listed with 2 IMAX 70mm shows each; catch any *extra* showtime added to them.

(This project previously tracked *The Odyssey* for an Aug 13+ drop; it was repurposed to Dune. Same infrastructure, same theaters.)

Two theaters:
- **AMC Metreon 16** — San Francisco, CA
- **Regal Hacienda Crossings** — Dublin, CA

Both are in `America/Los_Angeles`. All date logic uses Pacific local time.

**Trigger definition (agreed):** an alert fires when any IMAX 70mm performance of Dune: Part Three with a **local show date ≥ 2026-12-17** appears at either theater and was not already in the seen-set. Because Dec 17–20 are already listed, the seen-set **must be seeded** on cutover so those don't fire — only genuinely new performances alert. We do *not* gate on the buy button being active or on seat counts — first appearance is the signal.

## 2. Non-negotiable constraints

- **Read-only. Never automate checkout, seat holds, account login, or payment.** The app finds tickets and links the owner straight to the buy page; a human completes the purchase.
- **Personal use, low rate, be a good citizen.** Jittered intervals, realistic headers, honor `429`/`403` with backoff, use conditional requests (ETag/Last-Modified) where possible. If a source starts blocking, increase the interval — do not fight it.
- **Free tier only.** No paid hosting, no paid APIs. If a design choice costs money, pick another.
- **No secrets in the repo.** All keys/webhooks/topics go in Cloudflare secrets or `.dev.vars` (gitignored).

## 3. Stack & hosting (decided)

- **Language:** TypeScript.
- **Runtime/host:** **Cloudflare Workers** (free tier) — chosen because Cron Triggers are reliable down to 1-minute granularity, unlike GitHub Actions cron which drifts and skips. Do **not** use GitHub Actions for the hot-window polling.
- **State:** Cloudflare **KV** (seen-set + last-run metadata). KV is eventually consistent (writes can take up to ~60s to propagate); acceptable here, but see §7 on dedup.
- **Frontend:** minimal HTML served directly by the Worker (status view + manual "Refresh now" button). No framework needed. A fancier Next.js frontend can come later but is out of scope for v1.
- **Alerts:** ntfy (primary phone push) + Discord webhook + email. All three fire on trigger.

## 4. Data sources

### 4.1 AMC Metreon 16 — use the JSON API, not HTML

AMC exposes a real REST API. Prefer it.

- Base: `https://api.amctheatres.com`
- Showtimes for a theater on a date:
  `GET /v2/theatres/{theatreId}/showtimes/{M-D-YYYY}?movie={movieSlug}`
- Embargoed/future view (surfaces future-dated online tickets):
  `GET /v2/theatres/{theatreId}/showtimes/{M-D-YYYY}/views/embargoed`
- Auth: requires a vendor API key (`X-AMC-Vendor-Key` header). Register at `https://developers.amctheatres.com`.
- Useful response fields per showtime: `showDateTimeLocal`, `showDateTimeUtc`, `sellUntilDateTimeUtc`, `isSoldOut`, `isAlmostSoldOut`, `isCanceled`, `auditorium`, plus premium-format / attribute data used to identify IMAX 70mm.

**Poll both the standard and the embargoed views** and diff the union — whichever surfaces the Aug 13+ performances first is the winner, and it's not always the same one.

**Fallback if no API key is granted:** the `amctheatres.com` website calls internal JSON endpoints from the browser. Inspect the network tab on the theater's showtimes page, replicate that request, and parse its JSON. HTML scraping of the rendered page is the last resort.

### 4.2 Regal Hacienda Crossings — no public API

Regal has no equivalent public API, so this side is scrape-y and should be polled more gently.

- Primary: discover the internal JSON endpoint `regmovies.com` calls for a theater/movie/date (inspect XHR/fetch in DevTools). Replicate it.
- Secondary: parse server-rendered data embedded in the page (look for `__NEXT_DATA__` or an inline JSON blob) rather than scraping visible DOM text.
- Tertiary: Fandango as an aggregator for this theater's showtimes (expect bot protection; treat as flaky).
- Rotate a realistic desktop `User-Agent`, set `Accept-Language`, and back off hard on `403`/`429`.

## 5. Identifiers (resolved live — in `src/config.ts`)

These were discovered live and now live in [src/config.ts](src/config.ts):

1. **Fandango theater IDs:** Metreon 16 = `AANEM`, Hacienda Crossings = `AAOPK`. Endpoint `GET https://www.fandango.com/napi/theaterMovieShowtimes/{ID}?startDate=YYYY-MM-DD&numberOfDays=1`, after priming the theater page for Akamai cookies.
2. **Movie title (Fandango):** `Dune: Part Three (2026)`; matched by `MOVIE_TITLE_RE = /dune/i`.
3. **IMAX 70mm label:** Fandango `filmFormat[].filterName = "IMAX 70MM"`; filter `FORMAT_70MM_RE` also tolerates "70MM IMAX" / "IMAX® 70MM Film".
4. **AMC (dormant):** theatreId `2325`, group-id prefix `dune-part` (used by the SSR parser). AMC's site is now Queue-It walled, so this path is best-effort only.
5. **No AMC vendor key** was granted; Fandango is the primary and only reliable source.

## 6. Refresh cadence

Nobody publishes the exact drop time for these rolling extensions, so use a steady baseline plus a ramp during likely windows, all with jitter.

- **Baseline:** every ~15 min, 24/7.
- **Hot window (ramp to every ~2 min):**
  - Overnight → early morning Pacific, roughly **00:00–09:00 PT** (rolling booking windows tend to advance in this band), and
  - All day **Thursday and Friday** (film-week boundary; movie weeks run Fri–Thu).
- **Jitter** each run by a random 0–15s so requests don't land on the dot.
- **AMC** (API): fine to poll at the 2-min hot rate — trivial load with a key.
- **Regal** (scrape): keep to ~10–15 min even during the hot window; don't hammer it.
- **If an official on-sale datetime is announced** for the next block (the initial Odyssey on-sale was June 4, 2026, 9:00 AM PST), that beats guessing — poll every minute for the few minutes around it. Leave a config hook for a one-off "scheduled blitz" window.

**Implementation pattern (single cron, two rates):** set one Cron Trigger at `*/2 * * * *`. In the `scheduled` handler, compute current PT time; run the fetch if `inHotWindow(now)` is true **or** the current minute is a multiple of 15. This yields 15-min baseline + 2-min hot from one trigger. Regal gets an additional internal throttle so it only actually fetches every ~15 min regardless.

Free-tier math: a 2-min cron is 720 invocations/day, each doing a handful of fetches — far under the Workers free limits. Small-JSON parsing is trivial CPU. `setTimeout` jitter is I/O wait, not CPU, so it doesn't burn the CPU budget.

## 7. Detection & state

- Maintain a **seen-set** in KV keyed by a stable performance ID:
  - AMC: the showtime `id`.
  - Regal: `theaterId | date | time | auditorium` hashed, if no stable id is exposed.
- Store as a KV object `seen:performances` → `{ [perfId]: firstSeenISO }`, plus `meta:lastRun` → `{ ts, perTheaterCounts, errors }`.
- Each run, per theater: fetch → filter to **Dune: Part Three + IMAX 70mm + local date ≥ 2026-12-17** → for any perf not in the seen-set, collect as "new", then write them into the set.
- **Alert once per performance.** Because KV is eventually consistent, read the set at the start of the run, compute new items, send alerts, then write — and have the notifier itself no-op if the perf id is already marked notified. Crons don't overlap heavily, so this is sufficient.
- **Seed on cutover (mandatory here):** Dec 17–20 are already listed, so load the currently-listed showtimes into the seen-set once via `POST /api/seed`, so only a genuinely new Dec 17–20 addition or the first Dec 21+ appearance triggers — not the initial backfill. (Contrast the old Odyssey setup, where the Aug 13 threshold sat above all listings and seeding was near-empty.)

## 8. Notifications (all three fire on trigger)

Each alert includes: theater name, the date(s), the earliest showtime, and a **direct buy URL** deep-linking to the performance/seat-select page.

- **ntfy (primary push):** `POST https://ntfy.sh/<NTFY_TOPIC>` with `Title`, body, `Priority: high`, `Click` = buy URL, and a `Tags` emoji. Free, instant to the phone via the ntfy app. Topic name is a secret (anyone who knows it can read the topic).
- **Discord:** `POST` to `DISCORD_WEBHOOK_URL` with an embed (theater, date, showtime, buy link).
- **Email:** use **Resend** free tier (`RESEND_API_KEY`, ~3k/mo) — cleanest free transactional path from a Worker. (Note: MailChannels' free Cloudflare integration was discontinued, so don't rely on it. ntfy's email-forward feature is an acceptable backup.)
- Optional daily **heartbeat** ping (once/day, low priority) so the owner knows the watcher is alive and hasn't silently died.

Secrets to set (Cloudflare secrets / `.dev.vars`, all gitignored):
`AMC_API_KEY`, `NTFY_TOPIC`, `DISCORD_WEBHOOK_URL`, `RESEND_API_KEY`, `ALERT_EMAIL`, plus resolved theater/movie identifiers if kept as vars.

## 9. Manual refresh (frontend)

- `GET /` → tiny HTML page: last-run time, per-theater current known Aug 13+ showtimes, and a **"Refresh now"** button.
- `POST /api/refresh` → runs the same scrape immediately, returns JSON status. Rate-limit to ~1 per 10s to prevent accidental hammering.
- `GET /api/status` → returns `meta:lastRun` + current known showtimes from KV.
- The button calls `/api/refresh` then re-renders. Vanilla `fetch`, no framework.

## 10. Project structure

```
odyssey-watcher/
  wrangler.toml            # cron triggers, KV binding, vars
  package.json
  tsconfig.json
  .dev.vars               # local secrets (gitignored)
  .gitignore
  src/
    index.ts              # Worker: fetch() routes + scheduled() cron handler
    config.ts             # env parsing, theater/movie ids, date threshold, cadence
    scrapers/
      amc.ts              # fetchOdyssey70mm(theatre, dateRange) -> Performance[]
      regal.ts            # same shape, scrape-based
      types.ts            # Performance interface, shared
    detect.ts             # diff vs KV seen-set, returns new performances
    notify.ts             # ntfy + discord + email fan-out, dedup guard
    time.ts               # PT helpers, inHotWindow(), jitter()
    frontend.ts           # renders the / page HTML
  test/
    detect.test.ts        # simulate an Aug 13 perf appearing -> exactly one alert
    amc.parse.test.ts     # parse fixture JSON
    regal.parse.test.ts   # parse fixture HTML/JSON
    fixtures/
```

`Performance` shape (normalize both sources to this):
```ts
interface Performance {
  source: "amc" | "regal";
  theater: string;
  perfId: string;
  localDate: string;      // YYYY-MM-DD, PT
  localTime: string;      // HH:mm, PT
  format: string;         // raw label, must match IMAX 70mm filter
  buyUrl: string;
  soldOut?: boolean;
}
```

## 11. Dev workflow

- `npm i`
- `npx wrangler dev` — local run; hit `/` and `/api/refresh`.
- `npx wrangler deploy` — ship it.
- `npx wrangler tail` — live logs to confirm cron firing and catches.
- `npm test` — Vitest.
- Set secrets: `npx wrangler secret put AMC_API_KEY` (repeat per secret).
- Node 18+.

Build order suggestion: (1) resolve the §5 identifiers with throwaway scripts and confirm you can pull *any* Odyssey 70mm showtime as JSON from each source; (2) normalize to `Performance`; (3) detection + KV; (4) notifications with a forced test event; (5) cron + hot-window logic; (6) frontend; (7) seed seen-set and go live.

## 12. Testing the thing that matters

The single most important test: **seed the set with the currently-listed Dec 17–20 showtimes, then (a) inject an extra Dec 17 showtime and (b) inject a Dec 21 showtime, and assert exactly one alert per channel fires for each — and that a second run with the same data fires nothing.** Case (a) is the "additions to an already-listed day" path and case (b) the "new date" path. If that passes and live fetches return real data, the watcher works. See [test/detect.test.ts](test/detect.test.ts).

## 13. Failure modes to handle

- Source returns 403/429 → exponential backoff, skip this run, record in `meta.lastRun.errors`, do **not** crash the whole cron.
- AMC key rejected → fall back to internal-JSON path; surface a clear log line.
- Format label drift (source renames "IMAX 70mm") → log unmatched formats so the filter can be widened rather than silently missing the drop.
- KV write lag causing a duplicate alert → notifier dedup guard (§7) absorbs it.
- One source down shouldn't block the other — fetch them independently and alert on whichever succeeds.
