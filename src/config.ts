export interface Env {
  WATCHER_KV: KVNamespace;
  NTFY_TOPIC?: string;
  DISCORD_WEBHOOK_URL?: string;
  RESEND_API_KEY?: string;
  ALERT_EMAIL?: string;
  AMC_API_KEY?: string;
  BLITZ_START?: string;
  BLITZ_END?: string;
}

// The specific weekends we watch (Fri/Sat/Sun), local PT dates. When a weekend
// passes, its dates simply stop matching (expired shows are filtered out) — add
// future weekends by extending this list.
export const WATCH_DATES = [
  "2026-09-25", "2026-09-26", "2026-09-27", // Fri-Sun
  "2026-10-02", "2026-10-03", "2026-10-04",
  "2026-10-09", "2026-10-10", "2026-10-11",
  "2026-10-16", "2026-10-17", "2026-10-18",
  "2026-10-23", "2026-10-24", "2026-10-25",
];

// Within a watched weekend: Friday shows must start at/after this PT time
// (3:00 PM counts); Saturday/Sunday shows qualify at any time.
export const FRIDAY_EARLIEST = "15:00";

export const MOVIE_TITLE_RE = /odyssey/i;
// Matches "IMAX 70MM", "IMAX® 70MM Film", "imax70mm", "70MM IMAX"
export const FORMAT_70MM_RE = /(IMAX\W{0,2}70\s*MM|70\s*MM\W{0,2}IMAX)/i;

// Single source, single theater: Regal Hacienda Crossings via Fandango.
// (Regal's own site is server-side blocked; Fandango's internal JSON works.)
export const THEATER = {
  name: "Regal Hacienda Crossings",
  fandangoId: "AAOPK",
  fandangoPage:
    "https://www.fandango.com/regal-hacienda-crossings-screenx-imax-and-rpx-aaopk/theater-page",
} as const;

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// KV keys
export const KV_SEEN = "seen:performances";
export const KV_LAST_RUN = "meta:lastRun";
export const KV_LAST_FETCH = "meta:lastFetch";
export const KV_REFRESH_LOCK = "meta:refreshLock";
export const kvNotified = (perfId: string) => `notified:${perfId}`;

// Politeness throttle: scheduled runs actually fetch Fandango at most this
// often, regardless of the 2-min cron. Manual /api/refresh bypasses it.
export const FETCH_MIN_INTERVAL_MS = 12 * 60 * 1000;
