import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNapi } from "../src/scrapers/fandango";

const load = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url).pathname, "utf8"));

describe("fandango parser (The Odyssey @ Hacienda)", () => {
  it("extracts the Friday IMAX 70mm showtimes (10:10, 14:10, 18:10, 22:10)", () => {
    const perfs = parseNapi(load("odyssey-aaopk-2026-08-21.json"), "Regal Hacienda Crossings", []);
    expect(perfs.map((p) => p.localTime).sort()).toEqual(["10:10", "14:10", "18:10", "22:10"]);
    for (const p of perfs) {
      expect(p.format).toMatch(/IMAX 70MM/i);
      expect(p.localDate).toBe("2026-08-21");
      expect(p.perfId).toMatch(/^fd:(v2-[0-9a-f]+|\d+)$/);
      expect(p.buyUrl).toContain("fandango.com");
    }
    // parse only — the parser does NOT apply the weekend/time filter (that's qualifies()).
    expect(new Set(perfs.map((p) => p.perfId)).size).toBe(perfs.length);
  });

  it("extracts the Saturday showtimes too", () => {
    const perfs = parseNapi(load("odyssey-aaopk-2026-08-22.json"), "Regal Hacienda Crossings", []);
    expect(perfs.length).toBeGreaterThan(0);
    expect(perfs.every((p) => p.localDate === "2026-08-22")).toBe(true);
  });

  it("skips expired / past showtimes", () => {
    const synthetic = {
      viewModel: {
        movies: [
          {
            title: "The Odyssey (2026)",
            variants: [
              {
                amenityGroups: [
                  {
                    amenities: [{ name: "IMAX® 70MM Film" }],
                    showtimes: [
                      { id: 1, showtimeHashCode: "v2-past", expired: true, ticketingDate: "2026-08-21+10:10", type: "pastshowtime", filmFormat: [{ filterName: "IMAX 70MM", order: 1 }] },
                      { id: 2, showtimeHashCode: "v2-live", expired: false, ticketingDate: "2026-08-21+22:10", type: "standard", filmFormat: [{ filterName: "IMAX 70MM", order: 1 }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const perfs = parseNapi(synthetic, "Regal Hacienda Crossings", []);
    expect(perfs).toHaveLength(1);
    expect(perfs[0].localTime).toBe("22:10");
  });
});
