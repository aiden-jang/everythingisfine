import { describe, expect, it } from "vitest";
import { readVisit, type Visit } from "./library";
import { visitEvidence } from "./visitEvidence";

const at = Date.UTC(2022, 0, 15, 8, 59);
const visit: Visit = {
  id: "tonga",
  seen: at,
  position: { moment: { id: "tonga", at, choice: "PHNL", map: false } },
};

describe("source-stamped kept evidence", () => {
  it("ties the exported pressure and marked trace to the exact saved station and minute", () => {
    const evidence = visitEvidence(visit);
    expect(evidence.place).toBe("Honolulu");
    expect(evidence.reading).toBe("1017.75 hPa");
    expect(evidence.time).toContain("08:59");
    expect(evidence.trace?.selected).toBe(44);
    expect(evidence.trace?.values[44]?.toFixed(2)).toBe("1017.75");
  });
  it("does not substitute the nearest pressure outside recorded station coverage", () => {
    const evidence = visitEvidence({
      ...visit,
      position: { moment: { ...visit.position.moment!, at: Date.UTC(2022, 0, 15, 4, 20) } },
    });
    expect(evidence.trace).toBeUndefined();
    expect(evidence.detail).toContain("No station reading");
  });
  it("labels radar retention and calculated sky honestly", () => {
    expect(
      visitEvidence({ id: "radar", seen: at, position: { radar: { map: false, region: "world", at } } }),
    ).toMatchObject({ source: "RainViewer", kind: "Saved scan time" });
    const sky = visitEvidence({
      id: "sky",
      seen: at,
      position: { sky: { city: "Seoul", at, look: { azimuth: 180, altitude: 20 } } },
    });
    expect(sky.kind).toBe("Calculated sky");
    expect(sky.reading).toMatch(/^Moon -?\d/);
  });
  it("keeps bounded notes without persisting unrecognized fields", () => {
    expect(readVisit({ ...visit, note: "  A pulse across the ocean.  ", secret: "drop" })).toEqual({
      ...visit,
      note: "A pulse across the ocean.",
    });
    for (const note of ["x".repeat(281), 17, {}, " "])
      expect(readVisit({ ...visit, note })?.note).toBeUndefined();
  });
});
