import type { FetchResult, Performance } from "./types";
import { FORMAT_70MM_RE, THEATERS, USER_AGENT } from "../config";
import { toPT } from "../time";

// AMC's showtimes page is Next.js SSR; showtimes live in RSC flight data as
// escaped JSON: {\"showtimeId\":144696978,...\"showDateTimeUtc\":\"...\"}
// each followed by an aria-describedby string naming the movie slug and
// format group (e.g. "the-odyssey-76238-amc-metreon-16-imax70mm-0").
const SHOWTIME_RE =
  /\{\\"showtimeId\\":(\d+),[^{}]*?\\"status\\":\\"([^"\\]+)\\",[^{}]*?\\"showDateTimeUtc\\":\\"([^"\\]+)\\"[\s\S]{0,600}?\\"aria-describedby\\":\\"([^"\\]+)\\"/g;

export function parseAmcHtml(html: string, movieSlug: string): Performance[] {
  const out: Performance[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(SHOWTIME_RE)) {
    const [, id, status, utc, describedBy] = m;
    if (!describedBy.includes(movieSlug)) continue;
    if (!FORMAT_70MM_RE.test(describedBy)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const pt = toPT(new Date(utc));
    out.push({
      source: "amc",
      theater: THEATERS.metreon.name,
      perfId: `amc:${id}`,
      localDate: pt.date,
      localTime: pt.time,
      format: "IMAX 70MM (amc)",
      buyUrl: `${THEATERS.metreon.amcShowtimesUrl}?date=${pt.date}`,
      soldOut: status === "SoldOut",
    });
  }
  return out;
}

export async function fetchAmc(dates: string[]): Promise<FetchResult> {
  const performances: Performance[] = [];
  const errors: FetchResult["errors"] = [];
  for (const date of dates) {
    const url = `${THEATERS.metreon.amcShowtimesUrl}?date=${date}`;
    try {
      // redirect: "manual" so we can detect the Queue-It bot wall instead of
      // silently following into a queue page and parsing zero showtimes.
      const res = await fetch(url, {
        redirect: "manual",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location") ?? "";
        const walled = loc.includes("queue.amctheatres.com");
        errors.push({ source: "amc", message: walled ? `queue-walled on ${date}` : `redirect ${res.status} on ${date}` });
        await res.body?.cancel();
        break; // stop for the rest of this run; AMC is a best-effort second signal
      }
      if (res.status === 403 || res.status === 429) {
        errors.push({ source: "amc", message: `${res.status} on ${date} — backing off` });
        await res.body?.cancel();
        break;
      }
      if (!res.ok) {
        errors.push({ source: "amc", message: `${res.status} on ${date}` });
        await res.body?.cancel();
        continue;
      }
      const html = await res.text();
      performances.push(...parseAmcHtml(html, THEATERS.metreon.amcMovieSlug));
    } catch (e) {
      errors.push({ source: "amc", message: `fetch failed on ${date}: ${e}` });
    }
  }
  return { performances, errors };
}
