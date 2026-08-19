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

// First date we are hunting for. Everything on/after this (PT) that isn't
// already in the seen-set triggers an alert. Dec 17 is opening-preview night;
// Dec 17-20 are already listed (2 shows each) so SEEDING IS MANDATORY — the
// seed absorbs those, leaving only genuine additions (Dec 17-20) and the
// still-unannounced Dec 21+ block to fire.
export const TARGET_DATE = "2026-12-17";

// How many dates to scan per theater per run, starting at TARGET_DATE.
// 8 -> Dec 17-24: the 4 already-listed days plus the leading edge of the
// unannounced block. Widen once the next block drops.
export const SCAN_DAYS = 8;

// Known-positive date (Dec 17 currently lists 2 IMAX 70mm shows per theater).
// Scanned as a health canary: canaryCount is the raw fetched count (pre-dedup),
// so seeding never hides it — a zero here means the scrape pipeline is broken,
// not that there's no drop.
export const CANARY_DATE = "2026-12-17";

export const MOVIE_TITLE_RE = /dune/i;
// Matches "IMAX 70MM", "IMAX® 70MM Film", "imax70mm", "70MM IMAX"
export const FORMAT_70MM_RE = /(IMAX\W{0,2}70\s*MM|70\s*MM\W{0,2}IMAX)/i;

export const THEATERS = {
  metreon: {
    name: "AMC Metreon 16",
    fandangoId: "AANEM",
    fandangoPage: "https://www.fandango.com/amc-metreon-16-aanem/theater-page",
    // AMC direct (fallback signal). theatreId 2325 if a vendor key ever arrives.
    // NOTE: as of build time AMC's site is Queue-It walled (302 -> queue.amctheatres.com),
    // so this path is currently dormant; Fandango is the sole working source.
    amcShowtimesUrl:
      "https://www.amctheatres.com/movie-theatres/san-francisco/amc-metreon-16/showtimes",
    // Substring of the AMC group id, e.g. "dune-part-three-XXXXX-...-imax70mm-0".
    // Matching the prefix avoids needing the numeric id (unfetchable while walled).
    amcMovieSlug: "dune-part",
  },
  hacienda: {
    name: "Regal Hacienda Crossings",
    fandangoId: "AAOPK",
    fandangoPage:
      "https://www.fandango.com/regal-hacienda-crossings-screenx-imax-and-rpx-aaopk/theater-page",
    // Regal-direct is hard-blocked server-side (Cloudflare + TLS fingerprinting).
    // For future reference: theatre code 0347,
    // https://www.regmovies.com/api/getShowtimes?theatres=0347&date=MM-DD-YYYY
  },
} as const;

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// KV keys
export const KV_SEEN = "seen:performances";
export const KV_LAST_RUN = "meta:lastRun";
export const KV_AMC_LAST_FETCH = "meta:amcLastFetch";
export const KV_REFRESH_LOCK = "meta:refreshLock";
export const kvNotified = (perfId: string) => `notified:${perfId}`;

// AMC SSR scrape is throttled to this interval regardless of cron rate.
export const AMC_MIN_INTERVAL_MS = 10 * 60 * 1000;
