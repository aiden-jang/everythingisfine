import { describe, expect, it } from "vitest";
import { fetchHistory } from "./history";

/* EONET, for real. Run it deliberately: pnpm test:live See ARCHITECTURE.md#srcsourceshistorylivetestts. */

const day = (iso: string): { from: number; to: number } => {
  const from = Date.parse(`${iso}T00:00:00Z`);
  return { from, to: from + 3 * 86_400_000 };
};

describe("EONET, for real", () => {
  it("answers keylessly and parses into the four layers", async () => {
    const span = day("2024-08-01");
    const h = await fetchHistory(span.from, span.to);
    expect(h.answered).toBe(true);
    const total = h.cyclones.length + h.volcanoes.length + h.fires.length + h.floods.length;
    expect(total).toBeGreaterThan(0);
  }, 30_000);

  it("actually filters by date, which is the claim the whole feature rests on", async () => {
    const a = day("2024-08-01");
    const b = day("2026-05-15");
    const [one, two] = await Promise.all([fetchHistory(a.from, a.to), fetchHistory(b.from, b.to)]);
    expect(one.answered && two.answered).toBe(true);
    const ids = (h: Awaited<ReturnType<typeof fetchHistory>>): string[] =>
      [...h.cyclones, ...h.volcanoes, ...h.fires, ...h.floods].map((x) => x.id).sort();
    const first = ids(one);
    const second = ids(two);
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    // Two years apart must not be the same events. GDACS returned its current pool for both.
    expect(first.some((id) => second.includes(id))).toBe(false);
  }, 40_000);

  it("gives storms a track and a wind in km/h, and fires an area", async () => {
    const span = day("2024-08-01");
    const h = await fetchHistory(span.from, span.to);
    const storm = h.cyclones.find((c) => c.track.length > 1 && c.peakKmh !== null);
    if (storm) {
      // Knots in, km/h out: a 35kt tropical storm is 65km/h, so anything in the tens is the wrong unit.
      expect(storm.peakKmh!).toBeGreaterThan(40);
      expect(storm.name).not.toMatch(/tropical|hurricane|typhoon/i);
    }
    const fire = h.fires.find((f) => f.hectares !== null);
    if (fire) expect(fire.hectares!).toBeGreaterThan(0);
  }, 30_000);
});
