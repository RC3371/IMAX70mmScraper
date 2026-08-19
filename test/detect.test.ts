import { describe, expect, it, vi } from "vitest";
import { diffNew, qualifies, readSeen, writeSeen } from "../src/detect";
import { sendAlerts } from "../src/notify";
import type { Performance } from "../src/scrapers/types";
import { mockEnv } from "./helpers";

// 2026-09-25 Fri, 09-26 Sat, 09-27 Sun are the first watched weekend.
const perf = (over: Partial<Performance>): Performance => ({
  source: "fandango",
  theater: "Regal Hacienda Crossings",
  perfId: "fd:v2-a",
  localDate: "2026-09-26",
  localTime: "18:10",
  format: "IMAX 70MM",
  buyUrl: "https://example.com/buy",
  ...over,
});

const freshNotifier = () => ({
  ntfy: vi.fn().mockResolvedValue(undefined),
  discord: vi.fn().mockResolvedValue(undefined),
  email: vi.fn().mockResolvedValue(undefined),
});

describe("qualifies() — weekend + Friday-≥3pm filter", () => {
  it("Saturday and Sunday qualify at any time", () => {
    expect(qualifies(perf({ localDate: "2026-09-26", localTime: "10:10" }))).toBe(true);
    expect(qualifies(perf({ localDate: "2026-09-27", localTime: "23:30" }))).toBe(true);
  });
  it("Friday qualifies only at/after 15:00", () => {
    expect(qualifies(perf({ localDate: "2026-09-25", localTime: "15:00" }))).toBe(true); // 3:00 PM counts
    expect(qualifies(perf({ localDate: "2026-09-25", localTime: "18:10" }))).toBe(true);
    expect(qualifies(perf({ localDate: "2026-09-25", localTime: "14:30" }))).toBe(false);
    expect(qualifies(perf({ localDate: "2026-09-25", localTime: "10:10" }))).toBe(false);
  });
  it("rejects dates outside the watched weekends", () => {
    expect(qualifies(perf({ localDate: "2026-09-23", localTime: "18:10" }))).toBe(false); // a Wednesday
    expect(qualifies(perf({ localDate: "2026-11-06", localTime: "18:10" }))).toBe(false); // unwatched Friday
  });
});

describe("the test that matters (§12) — seed then alert once on new", () => {
  it("seed current qualifying → nothing; a new Sat show and a new Fri 3pm show each alert once per channel; rerun → none", async () => {
    const env = mockEnv();
    const notifier = freshNotifier();

    // Currently listed & qualifying (a Sat show + a Fri evening show).
    const current: Performance[] = [
      perf({ perfId: "fd:v2-sat1", localDate: "2026-09-26", localTime: "18:10" }),
      perf({ perfId: "fd:v2-fri1", localDate: "2026-09-25", localTime: "18:10" }),
    ];
    let seen = await readSeen(env);
    const initial = diffNew(current, seen);
    expect(initial).toHaveLength(2);
    await writeSeen(env, seen, initial, new Date().toISOString());

    seen = await readSeen(env);
    expect(diffNew(current, seen)).toEqual([]); // seeded → quiet

    // New drops: an added Saturday show and a Friday 3:00 PM show.
    const newSat = perf({ perfId: "fd:v2-sat2", localDate: "2026-09-26", localTime: "21:30" });
    const newFri3 = perf({ perfId: "fd:v2-fri3", localDate: "2026-09-25", localTime: "15:00" });
    // A Friday-before-3pm addition must NOT alert.
    const friEarly = perf({ perfId: "fd:v2-frie", localDate: "2026-09-25", localTime: "14:00" });

    seen = await readSeen(env);
    const fresh = diffNew([...current, newSat, newFri3, friEarly], seen);
    expect(fresh.map((p) => p.perfId).sort()).toEqual(["fd:v2-fri3", "fd:v2-sat2"]);

    const { sent } = await sendAlerts(env, fresh, notifier);
    expect(sent).toBe(2);
    expect(notifier.ntfy).toHaveBeenCalledTimes(1);
    expect(notifier.discord).toHaveBeenCalledTimes(1);
    expect(notifier.email).toHaveBeenCalledTimes(1);
    await writeSeen(env, seen, fresh, new Date().toISOString());

    seen = await readSeen(env);
    expect(diffNew([...current, newSat, newFri3, friEarly], seen)).toEqual([]);
    expect((await sendAlerts(env, [], notifier)).sent).toBe(0);
    expect(notifier.ntfy).toHaveBeenCalledTimes(1);
  });

  it("notified-guard absorbs a duplicate alert from KV write lag", async () => {
    const env = mockEnv();
    const notifier = freshNotifier();
    const p = perf({ perfId: "fd:v2-dup" });
    await sendAlerts(env, [p], notifier);
    expect((await sendAlerts(env, [p], notifier)).sent).toBe(0);
    expect(notifier.ntfy).toHaveBeenCalledTimes(1);
  });

  it("dedupes the same perf seen twice within one run", () => {
    const a = perf({ perfId: "fd:v2-same" });
    expect(diffNew([a, { ...a }], {})).toHaveLength(1);
  });
});
