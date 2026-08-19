import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAmcHtml } from "../src/scrapers/amc";

// The AMC SSR path is currently dormant (amctheatres.com is Queue-It walled),
// so a live Dune SSR fixture is unavailable. This exercises the movie-agnostic
// parser against the retained Odyssey fixture to prove the flight-data + PT-date
// extraction still works and that the slug filter is honored.
const html = readFileSync(new URL("./fixtures/amc-metreon.html", import.meta.url).pathname, "utf8");

describe("amc SSR parser (movie-agnostic)", () => {
  it("extracts IMAX 70mm showtimes for the matching slug with PT dates", () => {
    const perfs = parseAmcHtml(html, "the-odyssey-76238");
    expect(perfs.length).toBeGreaterThan(0);
    for (const p of perfs) {
      expect(p.perfId).toMatch(/^amc:\d+$/);
      expect(p.localDate).toBe("2026-08-12"); // 10pm PT show is Aug 13 UTC — PT must win
      expect(p.localTime).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it("returns nothing when the configured slug is absent from the page", () => {
    expect(parseAmcHtml(html, "dune-part")).toEqual([]);
  });
});
