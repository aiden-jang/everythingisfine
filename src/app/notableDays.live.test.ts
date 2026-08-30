import { describe, expect, it } from "vitest";
import { NOTABLE_DAYS } from "./notableDays";

/* The list's claims, against the catalogue that has to back them. Run it with `pnpm test:live`. See
   ARCHITECTURE.md. */
const QUERY = "https://earthquake.usgs.gov/fdsnws/event/1/query";

describe("every notable day, against USGS", () => {
  for (const day of NOTABLE_DAYS) {
    it(`${day.day} really is ${day.what} at M${day.magnitude}`, async () => {
      const from = Date.parse(`${day.day}T00:00:00Z`);
      const to = new Date(from + 86_400_000).toISOString().slice(0, 19);
      const res = await fetch(
        `${QUERY}?format=geojson&limit=1500&minmagnitude=2.5`
        + `&starttime=${day.day}T00:00:00&endtime=${to}`,
      );
      expect(res.ok).toBe(true);
      const body = (await res.json()) as { features?: { properties?: Record<string, unknown> }[] };
      const rows = body.features ?? [];
      expect(rows.length).toBeGreaterThan(0);
      const top = rows.reduce((best, x) => {
        const m = Number(x.properties?.["mag"] ?? 0);
        return m > Number(best.properties?.["mag"] ?? 0) ? x : best;
      }, rows[0]!);
      // Catalogues revise, so a tenth of slack; a whole point apart means the wrong day.
      expect(Number(top.properties?.["mag"])).toBeCloseTo(day.magnitude, 0);
    }, 30_000);
  }
});
