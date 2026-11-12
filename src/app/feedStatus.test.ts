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

  it("counts active radar and keeps an off layer visible without claiming a failure", () => {
    const radar = { id: "radar", label: "RainViewer storm radar", lastCheck: 123 } as const;
    const status = (state: "pending" | "ok" | "failed" | "off") =>
      feedStatus(streams(LIVE, LIVE), layers("ok"), {}, { ...radar, state });
    expect(status("pending")).toMatchObject({ arrived: 7, total: 8, settling: true });
    expect(status("ok")).toMatchObject({ arrived: 8, total: 8, phrase: "All feeds available" });
    expect(status("failed")).toMatchObject({ total: 8, phrase: "7 of 8 feeds available", settling: false });
    expect(status("off")).toMatchObject({ arrived: 7, total: 7, phrase: "All feeds available" });
    expect(status("off").rows.at(-1)).toEqual({ ...radar, state: "off" });
  });
});

describe("the phrase under the dot", () => {
  it("says connecting only while nothing at all has arrived", () => {
    expect(feedStatus(streams({ kind: "idle" }, { kind: "idle" }), layers("pending")).phrase).toBe(
      "connecting",
    );
  });

  it("counts what is in while the slow layers are still coming", () => {
    expect(feedStatus(streams(LIVE, LIVE), layers("pending")).phrase).toBe("2 of 7 feeds available");
  });

  it("names the shortfall once everything has answered", () => {
    expect(feedStatus(streams(LIVE, DOWN), layers("ok")).phrase).toBe("6 of 7 feeds available");
  });

  it("confirms when every background feed is available", () => {
    expect(feedStatus(streams(LIVE, LIVE), layers("ok")).phrase).toBe("All feeds available");
  });
});

it("does not call failed feeds connecting when every request has answered", () => {
  expect(feedStatus(streams(DOWN, DOWN), layers("failed")).phrase).toBe("0 of 7 feeds available");
});
