import type { Env } from "./config";
import { FETCH_MIN_INTERVAL_MS, KV_LAST_FETCH, KV_LAST_RUN, THEATER, WATCH_DATES } from "./config";
import { diffNew, qualifies, readSeen, writeSeen } from "./detect";
import { sendAlerts } from "./notify";
import { fetchFandango } from "./scrapers/fandango";
import type { Performance, SourceError } from "./scrapers/types";

export interface RunMeta {
  ts: string;
  qualifyingPerfs: Performance[]; // currently-known shows passing the weekend/time filter
  odysseyShowsFound: number; // total Odyssey 70mm shows at Hacienda across the window (info)
  newCount: number;
  seeded?: boolean;
  throttled?: boolean;
  errors: SourceError[];
}

// opts.seed: seed the seen-set without alerting. opts.force: bypass the fetch
// throttle (manual /api/refresh). Scheduled runs honor the throttle.
export async function runCheck(
  env: Env,
  opts: { seed?: boolean; force?: boolean } = {}
): Promise<RunMeta> {
  const nowISO = new Date().toISOString();

  // Politeness throttle: don't hit Fandango more often than FETCH_MIN_INTERVAL
  // on scheduled ticks. Seed and manual refresh always run.
  if (!opts.seed && !opts.force) {
    const last = await env.WATCHER_KV.get(KV_LAST_FETCH);
    if (last && Date.now() - Date.parse(last) < FETCH_MIN_INTERVAL_MS) {
      const prev = await env.WATCHER_KV.get<RunMeta>(KV_LAST_RUN, "json");
      return { ...(prev ?? emptyMeta(nowISO)), ts: nowISO, throttled: true };
    }
  }
  await env.WATCHER_KV.put(KV_LAST_FETCH, nowISO);

  // Single source: Regal Hacienda Crossings via Fandango.
  const { performances: all, errors } = await fetchFandango(
    THEATER.name,
    THEATER.fandangoId,
    THEATER.fandangoPage,
    [...WATCH_DATES]
  );

  const seen = await readSeen(env);
  const fresh = diffNew(all, seen);

  let newCount = 0;
  if (opts.seed) {
    // Cutover seeding: absorb whatever qualifying shows are already listed.
    await writeSeen(env, seen, fresh, nowISO);
  } else if (fresh.length > 0) {
    const { sent, errors: notifyErrors } = await sendAlerts(env, fresh);
    newCount = sent;
    for (const e of notifyErrors) errors.push({ source: "notify", message: e });
    await writeSeen(env, seen, fresh, nowISO);
  }

  const qualifyingPerfs = all
    .filter(qualifies)
    .sort((a, b) => `${a.localDate} ${a.localTime}`.localeCompare(`${b.localDate} ${b.localTime}`));

  const meta: RunMeta = {
    ts: nowISO,
    qualifyingPerfs,
    odysseyShowsFound: all.length,
    newCount,
    seeded: opts.seed,
    errors,
  };
  await env.WATCHER_KV.put(KV_LAST_RUN, JSON.stringify(meta));
  for (const e of errors) console.log(`[error] ${e.source}: ${e.message}`);
  console.log(
    `[run] ${nowISO} odysseyShows=${all.length} qualifying=${qualifyingPerfs.length} new=${newCount}${opts.seed ? " (seed)" : ""}`
  );
  return meta;
}

function emptyMeta(ts: string): RunMeta {
  return { ts, qualifyingPerfs: [], odysseyShowsFound: 0, newCount: 0, errors: [] };
}
