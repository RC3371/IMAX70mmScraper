import type { Env } from "./config";
import { FRIDAY_EARLIEST, KV_SEEN, WATCH_DATES } from "./config";
import type { Performance } from "./scrapers/types";
import { dayOfWeek, FRIDAY } from "./time";

export type SeenSet = Record<string, string>; // perfId -> firstSeenISO

const WATCH_SET = new Set<string>(WATCH_DATES);

// A performance qualifies if it falls on one of the watched weekend dates and
// respects the time rule: Friday shows must be at/after FRIDAY_EARLIEST (3pm);
// Saturday/Sunday shows qualify at any time. (Movie/format/theater/expired
// filtering already happened in the Fandango parser.)
export function qualifies(p: Performance): boolean {
  if (!WATCH_SET.has(p.localDate)) return false;
  if (dayOfWeek(p.localDate) === FRIDAY) return p.localTime >= FRIDAY_EARLIEST;
  return true;
}

// Pure diff: which qualifying performances are not yet in the seen-set.
export function diffNew(perfs: Performance[], seen: SeenSet): Performance[] {
  const unique = new Map<string, Performance>();
  for (const p of perfs) {
    if (qualifies(p) && !(p.perfId in seen) && !unique.has(p.perfId)) unique.set(p.perfId, p);
  }
  return [...unique.values()];
}

export async function readSeen(env: Env): Promise<SeenSet> {
  return (await env.WATCHER_KV.get<SeenSet>(KV_SEEN, "json")) ?? {};
}

export async function writeSeen(env: Env, seen: SeenSet, newPerfs: Performance[], nowISO: string) {
  if (newPerfs.length === 0) return;
  for (const p of newPerfs) seen[p.perfId] = nowISO;
  await env.WATCHER_KV.put(KV_SEEN, JSON.stringify(seen));
}
