import { describe, expect, it, vi } from "vitest";
import { diffNew, readSeen, writeSeen } from "../src/detect";
import { sendAlerts } from "../src/notify";
import type { Performance } from "../src/scrapers/types";
import { mockEnv } from "./helpers";

const perf = (over: Partial<Performance>): Performance => ({
  source: "fandango",
  theater: "AMC Metreon 16",
  perfId: "fd:v2-aaa",
  localDate: "2026-12-17",
  localTime: "19:00",
  format: "IMAX 70MM",
  buyUrl: "https://example.com/buy",
  ...over,
});

// Current live state: Dec 17-20 each already list 2 IMAX 70mm shows.
const currentlyListed: Performance[] = [
  perf({ perfId: "fd:d17-19", localDate: "2026-12-17", localTime: "19:00" }),
  perf({ perfId: "fd:d17-23", localDate: "2026-12-17", localTime: "23:00" }),
  perf({ perfId: "fd:d18-19", localDate: "2026-12-18", localTime: "19:00" }),
  perf({ perfId: "fd:d18-23", localDate: "2026-12-18", localTime: "23:00" }),
  perf({ perfId: "fd:d20-19", localDate: "2026-12-20", localTime: "19:00" }),
  perf({ perfId: "fd:d20-23", localDate: "2026-12-20", localTime: "23:00" }),
];

const freshNotifier = () => ({
  ntfy: vi.fn().mockResolvedValue(undefined),
  discord: vi.fn().mockResolvedValue(undefined),
  email: vi.fn().mockResolvedValue(undefined),
});

describe("the test that matters (§12) — Dune two-mode detection", () => {
  it("seed Dec 17-20 → nothing fires; then a NEW Dec 17 show and a NEW Dec 21 show each fire exactly once per channel; rerun fires nothing", async () => {
    const env = mockEnv();
    const notifier = freshNotifier();

    // Seed the currently-listed shows — they must NOT alert.
    let seen = await readSeen(env);
    const initial = diffNew(currentlyListed, seen);
    expect(initial).toHaveLength(currentlyListed.length); // all are >= Dec 17, none seen yet
    await writeSeen(env, seen, initial, new Date().toISOString());
    // (in production this is the /api/seed path — seeds without notifying)

    // Re-fetch same listings → nothing new.
    seen = await readSeen(env);
    expect(diffNew(currentlyListed, seen)).toEqual([]);

    // (a) ADDITION: a 3rd Dec 17 show (9pm) appears.
    const addition = perf({ perfId: "fd:d17-21", localDate: "2026-12-17", localTime: "21:00" });
    // (b) NEW DATE: the unannounced Dec 21 block drops.
    const newDate = perf({ perfId: "fd:d21-19", localDate: "2026-12-21", localTime: "19:00" });

    seen = await readSeen(env);
    const fresh = diffNew([...currentlyListed, addition, newDate], seen);
    expect(fresh.map((p) => p.perfId).sort()).toEqual(["fd:d17-21", "fd:d21-19"]);

    const { sent } = await sendAlerts(env, fresh, notifier);
    expect(sent).toBe(2);
    expect(notifier.ntfy).toHaveBeenCalledTimes(1); // one batched alert covering both
    expect(notifier.discord).toHaveBeenCalledTimes(1);
    expect(notifier.email).toHaveBeenCalledTimes(1);
    await writeSeen(env, seen, fresh, new Date().toISOString());

    // Second run, same data → nothing fires.
    seen = await readSeen(env);
    expect(diffNew([...currentlyListed, addition, newDate], seen)).toEqual([]);
    const second = await sendAlerts(env, [], notifier);
    expect(second.sent).toBe(0);
    expect(notifier.ntfy).toHaveBeenCalledTimes(1);
  });

  it("never alerts on shows before the threshold (Dec 16 or earlier)", () => {
    const early = perf({ perfId: "fd:d16", localDate: "2026-12-16", localTime: "19:00" });
    expect(diffNew([early], {})).toEqual([]);
  });

  it("notified-guard absorbs a duplicate alert from KV write lag", async () => {
    const env = mockEnv();
    const notifier = freshNotifier();
    const p = perf({ perfId: "fd:dup" });
    await sendAlerts(env, [p], notifier);
    const dup = await sendAlerts(env, [p], notifier); // stale seen-set read re-diffs it as new
    expect(dup.sent).toBe(0);
    expect(notifier.ntfy).toHaveBeenCalledTimes(1);
  });

  it("dedupes the same perf reported by two sources within one run", () => {
    const a = perf({ perfId: "fd:same" });
    expect(diffNew([a, { ...a }], {})).toHaveLength(1);
  });
});
