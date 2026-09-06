import { describe, expect, it } from "vitest";
import { feedStatus, type LayerAnswer } from "./feedStatus";
import type { SourceId, SourceStatus } from "../sources/types";

const streams = (usgs: SourceStatus, emsc: SourceStatus): Record<SourceId, SourceStatus> => ({ usgs, emsc });
const layers = (
  a: LayerAnswer,
): Record<"cyclones" | "volcanoes" | "fires" | "floods" | "aurora", LayerAnswer> => ({
  cyclones: a,
  volcanoes: a,
  fires: a,
  floods: a,
  aurora: a,
});

const LIVE: SourceStatus = { kind: "live", since: 0 };
const DOWN: SourceStatus = { kind: "failing", reason: "no", retryAt: 0 };

describe("what the header dot may claim", () => {
  it("counts the hazard layers, not just the two quake feeds", () => {
    const s = feedStatus(streams(LIVE, LIVE), layers("ok"));
    expect(s).toMatchObject({ arrived: 7, total: 7, settling: false });
  });

  it("is still settling while any layer is in flight, even with both feeds live", () => {
    expect(feedStatus(streams(LIVE, LIVE), layers("pending")).settling).toBe(true);
  });

  it("is settling while a quake feed has not started, even with every layer in", () => {
    expect(feedStatus(streams({ kind: "idle" }, LIVE), layers("ok")).settling).toBe(true);
  });

  it("settles short of the total when something failed rather than never answering", () => {
    const s = feedStatus(streams(LIVE, DOWN), { ...layers("ok"), fires: "failed" });
    expect(s).toMatchObject({ arrived: 5, total: 7, settling: false });
    expect(s.silent).toMatch(/fires/);
  });

  it("does not name a layer that is merely still in flight", () => {
    expect(feedStatus(streams(LIVE, LIVE), layers("pending")).silent).toBeNull();
  });
});

describe("the phrase under the dot", () => {
  it("says connecting only while nothing at all has arrived", () => {
    expect(feedStatus(streams({ kind: "idle" }, { kind: "idle" }), layers("pending")).phrase).toBe(
      "connecting",
    );
  });

  it("counts what is in while the slow layers are still coming", () => {
    expect(feedStatus(streams(LIVE, LIVE), layers("pending")).phrase).toBe("2 of 7 feeds live");
  });

  it("names the shortfall once everything has answered", () => {
    expect(feedStatus(streams(LIVE, DOWN), layers("ok")).phrase).toBe("6 of 7 feeds live");
  });

  it("does not count when there is nothing to count against", () => {
    expect(feedStatus(streams(LIVE, LIVE), layers("ok")).phrase).toBe("all feeds live");
  });
});
