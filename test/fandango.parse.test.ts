import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNapi } from "../src/scrapers/fandango";

const load = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url).pathname, "utf8"));

describe("fandango parser (Dune: Part Three)", () => {
  it("extracts both Dec 17 IMAX 70MM shows at Metreon (7pm + 11pm)", () => {
    const perfs = parseNapi(load("dune-aanem-dec17.json"), "AMC Metreon 16", []);
    expect(perfs).toHaveLength(2);
    expect(perfs.map((p) => p.localTime).sort()).toEqual(["19:00", "23:00"]);
    for (const p of perfs) {
      expect(p.format).toMatch(/IMAX 70MM/i);
      expect(p.localDate).toBe("2026-12-17");
      expect(p.buyUrl).toContain("fandango.com");
    }
  });

  it("keys perfId on showtimeHashCode when numeric id is absent (Dune has no id)", () => {
    const perfs = parseNapi(load("dune-aanem-dec17.json"), "AMC Metreon 16", []);
    // must be stable + unique — never the fd:undefined collapse
    for (const p of perfs) expect(p.perfId).toMatch(/^fd:(v2-[0-9a-f]+|\d+)$/);
    expect(new Set(perfs.map((p) => p.perfId)).size).toBe(perfs.length);
  });

  it("flags the sold-out Dec 17 show", () => {
    const perfs = parseNapi(load("dune-aanem-dec17.json"), "AMC Metreon 16", []);
    expect(perfs.some((p) => p.soldOut)).toBe(true);
  });

  it("extracts Hacienda Dec 17 shows (7pm + 10:45pm)", () => {
    const perfs = parseNapi(load("dune-aaopk-dec17.json"), "Regal Hacienda Crossings", []);
    expect(perfs).toHaveLength(2);
    expect(perfs.map((p) => p.localTime).sort()).toEqual(["19:00", "22:45"]);
  });

  it("returns nothing for Dec 21 (Dune not yet listed — the drop we're waiting for)", () => {
    expect(parseNapi(load("dune-aanem-dec21.json"), "AMC Metreon 16", [])).toEqual([]);
  });
});
