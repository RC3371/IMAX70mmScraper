import type { FetchResult, Performance } from "./types";
import { FORMAT_70MM_RE, MOVIE_TITLE_RE, USER_AGENT } from "../config";

interface FandangoShowtime {
  // The numeric `id` is inconsistent — present in some responses, absent in
  // others, and observed changing over time for the same show. `showtimeHashCode`
  // is always present and is Fandango's canonical per-showtime id (it's embedded
  // in the jump/buy URL), so we key the seen-set on it. Keying on `id` would let
  // the same show flip perfIds between runs → duplicate alerts. See perfIdFor().
  id?: number;
  showtimeHashCode?: string;
  expired: boolean;
  ticketingDate: string; // "2026-12-17+19:00" (theater-local, i.e. PT)
  type: string; // "standard" | "soldout" | "available" | "pastshowtime" | ...
  filmFormat?: { filterName: string; order: number }[];
  ticketingJumpPageURL?: string;
}

// Stable dedup key: the always-present canonical hash code, then numeric id,
// then a date+time composite. Never returns "fd:undefined" (which would
// collapse every perf into one key and defeat dedup).
function perfIdFor(st: FandangoShowtime): string {
  const key = st.showtimeHashCode || (st.id != null ? String(st.id) : `dt:${st.ticketingDate}`);
  return `fd:${key}`;
}

interface FandangoNapi {
  viewModel?: {
    movies?: {
      title: string;
      variants?: {
        amenityGroups?: {
          amenities?: { name: string }[];
          showtimes?: FandangoShowtime[];
        }[];
      }[];
    }[];
  };
}

const baseHeaders = {
  "User-Agent": USER_AGENT,
  "Accept-Language": "en-US,en;q=0.9",
};

// Fandango's napi rejects bare calls; priming the theater page first yields
// Akamai cookies that make the JSON endpoint answer.
async function primeCookies(theaterPage: string): Promise<string> {
  const res = await fetch(theaterPage, {
    headers: { ...baseHeaders, Accept: "text/html" },
    redirect: "follow",
  });
  const cookies: string[] = [];
  // Workers expose repeated Set-Cookie headers via getSetCookie()
  const setCookies =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
  for (const c of setCookies) cookies.push(c.split(";")[0]);
  await res.body?.cancel();
  if (!res.ok) throw new Error(`prime ${theaterPage} -> ${res.status}`);
  return cookies.join("; ");
}

function parseNapi(
  data: FandangoNapi,
  theaterName: string,
  unmatchedLog: string[]
): Performance[] {
  const out: Performance[] = [];
  for (const movie of data.viewModel?.movies ?? []) {
    if (!MOVIE_TITLE_RE.test(movie.title)) continue;
    for (const variant of movie.variants ?? []) {
      for (const group of variant.amenityGroups ?? []) {
        const amenityStr = (group.amenities ?? []).map((a) => a.name).join(", ");
        for (const st of group.showtimes ?? []) {
          // Skip past/expired shows — a watched date can be "today" with
          // earlier showtimes already gone; those aren't buyable tickets.
          if (st.expired || st.type === "pastshowtime") continue;
          const formats = (st.filmFormat ?? []).map((f) => f.filterName);
          const label = formats.join(", ") || amenityStr;
          const is70 =
            formats.some((f) => FORMAT_70MM_RE.test(f)) || FORMAT_70MM_RE.test(amenityStr);
          if (!is70) {
            unmatchedLog.push(`${theaterName}: "${movie.title}" [${label}] not 70mm-matched`);
            continue;
          }
          const [localDate, localTime] = st.ticketingDate.split("+");
          out.push({
            source: "fandango",
            theater: theaterName,
            perfId: perfIdFor(st),
            localDate,
            localTime: localTime ?? "",
            format: label,
            buyUrl:
              st.ticketingJumpPageURL ??
              `https://www.fandango.com/search?q=${encodeURIComponent(movie.title)}`,
            soldOut: st.type === "soldout",
          });
        }
      }
    }
  }
  return out;
}

export async function fetchFandango(
  theaterName: string,
  fandangoId: string,
  theaterPage: string,
  dates: string[]
): Promise<FetchResult> {
  const performances: Performance[] = [];
  const errors: FetchResult["errors"] = [];
  const unmatched: string[] = [];
  let cookie = "";
  try {
    cookie = await primeCookies(theaterPage);
  } catch (e) {
    errors.push({ source: `fandango:${fandangoId}`, message: `cookie prime failed: ${e}` });
    return { performances, errors };
  }
  for (const date of dates) {
    const url = `https://www.fandango.com/napi/theaterMovieShowtimes/${fandangoId}?startDate=${date}&numberOfDays=1`;
    try {
      const res = await fetch(url, {
        headers: { ...baseHeaders, Accept: "application/json", Referer: theaterPage, Cookie: cookie },
      });
      if (res.status === 403 || res.status === 429) {
        errors.push({ source: `fandango:${fandangoId}`, message: `${res.status} on ${date} — backing off` });
        break; // stop hammering this source for the rest of the run
      }
      if (!res.ok) {
        errors.push({ source: `fandango:${fandangoId}`, message: `${res.status} on ${date}` });
        continue;
      }
      const data = (await res.json()) as FandangoNapi & { error?: string };
      if (data.error) {
        errors.push({ source: `fandango:${fandangoId}`, message: `napi error on ${date}: ${data.error}` });
        continue;
      }
      performances.push(...parseNapi(data, theaterName, unmatched));
    } catch (e) {
      errors.push({ source: `fandango:${fandangoId}`, message: `fetch failed on ${date}: ${e}` });
    }
  }
  for (const u of unmatched) console.log(`[format-drift] ${u}`);
  return { performances, errors };
}

export { parseNapi };
