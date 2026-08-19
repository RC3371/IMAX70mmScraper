import type { Env } from "./config";
import { KV_SEEN, TARGET_DATE } from "./config";
import type { Performance } from "./scrapers/types";

export type SeenSet = Record<string, string>; // perfId -> firstSeenISO

export function isTarget(p: Performance): boolean {
  return p.localDate >= TARGET_DATE;
}

// Pure diff: which target performances are not yet in the seen-set.
export function diffNew(perfs: Performance[], seen: SeenSet): Performance[] {
  const unique = new Map<string, Performance>();
  for (const p of perfs) {
    if (isTarget(p) && !(p.perfId in seen) && !unique.has(p.perfId)) unique.set(p.perfId, p);
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
