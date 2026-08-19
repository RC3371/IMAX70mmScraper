import type { Env } from "./config";
import {
  AMC_MIN_INTERVAL_MS,
  CANARY_DATE,
  KV_AMC_LAST_FETCH,
  KV_LAST_RUN,
  SCAN_DAYS,
  TARGET_DATE,
  THEATERS,
} from "./config";
import { diffNew, readSeen, writeSeen } from "./detect";
import { sendAlerts } from "./notify";
import { fetchAmc } from "./scrapers/amc";
import { fetchFandango } from "./scrapers/fandango";
import type { Performance, SourceError } from "./scrapers/types";
import { dateRange } from "./time";

export interface RunMeta {
  ts: string;
  perTheaterCounts: Record<string, number>;
  targetPerfs: Performance[]; // currently-known >= TARGET_DATE perfs
  canaryCount: number; // Dune 70mm perfs on CANARY_DATE; 0 = pipeline likely broken
  newCount: number;
  seeded?: boolean;
  errors: SourceError[];
}

export async function runCheck(env: Env, opts: { seed?: boolean } = {}): Promise<RunMeta> {
  // CANARY_DATE may sit inside the scan range (it does for Dune: Dec 17), so
  // dedupe to avoid fetching the same day twice.
  const dates = [...new Set([CANARY_DATE, ...dateRange(TARGET_DATE, SCAN_DAYS)])];
  const nowISO = new Date().toISOString();
  const errors: SourceError[] = [];
  const all: Performance[] = [];

  // Sources fetch independently; one failing never blocks the other.
  const fandangoJobs = [
    fetchFandango(THEATERS.metreon.name, THEATERS.metreon.fandangoId, THEATERS.metreon.fandangoPage, dates),
    fetchFandango(THEATERS.hacienda.name, THEATERS.hacienda.fandangoId, THEATERS.hacienda.fandangoPage, dates),
  ];

  // AMC SSR scrape is a second signal for Metreon, throttled to ~10 min.
  const amcLast = await env.WATCHER_KV.get(KV_AMC_LAST_FETCH);
  const amcDue = !amcLast || Date.now() - Date.parse(amcLast) >= AMC_MIN_INTERVAL_MS;
  const jobs: Promise<{ performances: Performance[]; errors: SourceError[] }>[] = [...fandangoJobs];
  if (amcDue) jobs.push(fetchAmc(dates));

  const results = await Promise.allSettled(jobs);
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      all.push(...r.value.performances);
      errors.push(...r.value.errors);
    } else {
      errors.push({ source: i < 2 ? "fandango" : "amc", message: String(r.reason) });
    }
  });
  if (amcDue) await env.WATCHER_KV.put(KV_AMC_LAST_FETCH, nowISO);

  const seen = await readSeen(env);
  const fresh = diffNew(all, seen);

  let newCount = 0;
  if (opts.seed) {
    // First-deploy seeding: absorb whatever is already listed without alerting.
    await writeSeen(env, seen, fresh, nowISO);
  } else if (fresh.length > 0) {
    const { sent, errors: notifyErrors } = await sendAlerts(env, fresh);
    newCount = sent;
    for (const e of notifyErrors) errors.push({ source: "notify", message: e });
    await writeSeen(env, seen, fresh, nowISO);
  }

  const targetPerfs = all
    .filter((p) => p.localDate >= TARGET_DATE)
    .sort((a, b) => `${a.localDate} ${a.localTime}`.localeCompare(`${b.localDate} ${b.localTime}`));

  const perTheaterCounts: Record<string, number> = {};
  for (const p of all) perTheaterCounts[p.theater] = (perTheaterCounts[p.theater] ?? 0) + 1;

  const canaryCount = all.filter((p) => p.localDate === CANARY_DATE).length;
  if (canaryCount === 0) console.log(`[canary] WARNING: no Dune 70mm found on ${CANARY_DATE} — scrape pipeline may be broken`);

  const meta: RunMeta = { ts: nowISO, perTheaterCounts, targetPerfs, canaryCount, newCount, seeded: opts.seed, errors };
  await env.WATCHER_KV.put(KV_LAST_RUN, JSON.stringify(meta));
  for (const e of errors) console.log(`[error] ${e.source}: ${e.message}`);
  console.log(
    `[run] ${nowISO} counts=${JSON.stringify(perTheaterCounts)} target=${targetPerfs.length} new=${newCount}${opts.seed ? " (seed)" : ""}`
  );
  return meta;
}
