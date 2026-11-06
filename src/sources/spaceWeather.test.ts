import { describe, expect, it } from "vitest";
import { solarWind, xrayFlux } from "./spaceWeather";

const now = Date.parse("2026-11-06T01:12:00Z");

describe("NOAA space weather", () => {
  it("keeps recent primary wind measurements and parses the upstream clock as UTC", () => {
    const base = { active: true, source: "SOLAR1", proton_speed: 318.1, proton_density: 2.77 };
    expect(
      solarWind(
        [
          { ...base, time_tag: "2026-11-06T01:08:00" },
          { ...base, time_tag: "2026-11-06T01:09:00", active: false, source: "ACE", proton_speed: 337 },
          { ...base, time_tag: "2026-11-06T01:06:00", proton_density: null },
          { ...base, time_tag: "2026-11-06T00:08:00" },
          { ...base, time_tag: "2026-11-06T02:09:00" },
          { ...base, time_tag: "2026-11-06T01:11:00", proton_speed: null },
        ],
        now,
      ),
    ).toEqual([
      { at: Date.parse("2026-11-06T01:06:00Z"), value: 318.1, source: "SOLAR-1", density: null },
      { at: Date.parse("2026-11-06T01:08:00Z"), value: 318.1, source: "SOLAR-1", density: 2.77 },
    ]);
  });

  it("keeps the long GOES X-ray band and its corrected flux", () => {
    const base = {
      time_tag: "2026-11-06T01:10:00Z",
      satellite: 18,
      energy: "0.1-0.8nm",
      flux: 7.16e-7,
      observed_flux: 7.38e-7,
    };
    expect(
      xrayFlux(
        [
          base,
          { ...base, energy: "0.05-0.4nm", flux: 1.14e-8 },
          { ...base, time_tag: "2026-11-06T01:11:00Z", flux: 0 },
          { ...base, time_tag: "2026-11-05T18:59:00Z" },
        ],
        now,
      ),
    ).toEqual([{ at: Date.parse(base.time_tag), value: base.flux, source: "GOES-18" }]);
  });

  it("distinguishes an empty series from a malformed response", () => {
    expect(solarWind([], now)).toEqual([]);
    expect(() => xrayFlux({ status: "maintenance" }, now)).toThrow("Unexpected NOAA response");
  });
});
