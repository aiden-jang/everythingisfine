import { describe, expect, it } from "vitest";
import { GLOBAL_RADAR_BOUNDS, radarMercatorY, rainviewerScans, rainviewerTiles } from "./rainviewer";

const now = Date.UTC(2026, 10, 11, 12);
const host = "https://tilecache.rainviewer.com";
const frame = (minutes: number) => ({
  time: (now - minutes * 60_000) / 1000,
  path: `/v2/radar/frame${minutes}`,
});

describe("international radar", () => {
  it("uses past frames only and bounds, sorts and deduplicates the two-hour window", () => {
    const past = [frame(30), frame(0), frame(30), frame(120), frame(121), frame(-5), null, {}];
    const scans = rainviewerScans({ host, radar: { past, nowcast: [frame(-10)] } }, now);
    expect(scans.map(({ at }) => at)).toEqual([120, 30, 0].map((minutes) => now - minutes * 60_000));
    expect(
      rainviewerScans({ host, radar: { past: Array.from({ length: 100 }, (_, i) => frame(i)) } }, now),
    ).toHaveLength(13);
    expect(rainviewerScans({ host, radar: { past: [] } }, now)).toEqual([]);
  });

  it("rejects unexpected hosts, error payloads and paths without requesting arbitrary URLs", () => {
    expect(() => rainviewerScans({ host: "https://other.example", radar: { past: [] } }, now)).toThrow();
    expect(() => rainviewerScans({ error: "unavailable" }, now)).toThrow();
    expect(
      rainviewerScans({ host, radar: { past: [{ ...frame(0), path: "/v2/radar/../secret" }] } }, now),
    ).toEqual([]);
    expect(() => rainviewerTiles("https://other.example/")).toThrow();
  });

  it("requests four world tiles using the supported palette and observation layer", () => {
    expect(rainviewerTiles("/v2/radar/abc")).toEqual([
      `${host}/v2/radar/abc/512/1/0/0/2/1_0.png`,
      `${host}/v2/radar/abc/512/1/1/0/2/1_0.png`,
      `${host}/v2/radar/abc/512/1/0/1/2/1_0.png`,
      `${host}/v2/radar/abc/512/1/1/1/2/1_0.png`,
    ]);
    expect(rainviewerTiles()).toHaveLength(4);
    expect(rainviewerTiles()[0]).toContain("/v2/coverage/0/512/1/0/0/0/0_0.png");
    expect(radarMercatorY(0)).toBe(0.5);
    expect(radarMercatorY(GLOBAL_RADAR_BOUNDS[3])).toBeCloseTo(0);
    expect(radarMercatorY(GLOBAL_RADAR_BOUNDS[1])).toBeCloseTo(1);
    expect(radarMercatorY(60)).toBeCloseTo(0.29039964);
  });
});
