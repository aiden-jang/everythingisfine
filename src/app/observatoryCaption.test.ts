import { describe, expect, it } from "vitest";
import { observatoryCaption } from "./observatoryCaption";

const at = Date.parse("2026-11-09T12:34:00Z");
const base: Parameters<typeof observatoryCaption>[0] = {
  observing: true,
  night: false,
  radar: { active: false, view: null },
  tonight: { view: null },
  floatDive: { view: null },
  observations: { entry: null, view: null },
  aurora: { run: null },
};

describe("captions describe the view that is actually saved", () => {
  it("keeps the earthquake caption in Explore", () => {
    expect(observatoryCaption({ ...base, observing: false })).toBeNull();
  });
  it("stamps the selected radar scan instead of the current clock", () => {
    const result = observatoryCaption(
      {
        ...base,
        radar: {
          active: true,
          view: {
            kind: "radar",
            image: null,
            at,
            target: { lon: -95, lat: 37, zoom: 1.4 },
          },
        },
      },
      at + 3600000,
    );
    expect(result).toMatchObject({
      subject: "Storm Radar",
      moment: "2026-11-09 12:34 UTC",
      verdict: null,
      magnitudeScale: false,
    });
    expect(result?.filter).toContain("NOAA MRMS");
  });
  it("does not turn a missing scan timestamp into a live claim", () => {
    expect(observatoryCaption({ ...base, radar: { active: true, view: null } }, at)?.moment).toBe(
      "Scan unavailable",
    );
  });
  it("uses a reconstruction age instead of interpreting it as a date", () => {
    const result = observatoryCaption({
      ...base,
      observations: {
        entry: "deep",
        view: {
          kind: "observation",
          frame: { at: 0, timeLabel: "230 million years ago" },
          target: { lon: 0, lat: 0, zoom: 1 },
          image: null,
        },
      },
    });
    expect(result).toMatchObject({
      subject: "Deep Time",
      moment: "230 million years ago",
      filter: "EarthByte / GPlates",
      magnitudeScale: false,
    });
  });
});
