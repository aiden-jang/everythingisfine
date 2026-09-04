import { describe, expect, it } from "vitest";
import { findSubject, linesFor } from "./MarkCard";

const NOW = Date.parse("2026-08-21T12:00:00Z");
const cyclone = {
  id: "TC1",
  name: "SAUDEL-26",
  lon: 130,
  lat: 18,
  peakKmh: 222,
  track: [
    { lon: 131, lat: 17 },
    { lon: 130, lat: 18 },
  ],
} as never;
const volcano = {
  id: "VO1",
  name: "Etna",
  country: "Italy",
  lon: 15,
  lat: 37.7,
  endedAt: NOW - 9 * 86_400_000,
} as never;
const fire = {
  id: "WF1",
  country: "Angola",
  lon: 18,
  lat: -12,
  hectares: 34_160,
  startedAt: NOW - 9 * 86_400_000,
  endedAt: NOW,
} as never;
const flood = {
  id: "FL1",
  country: "Thailand",
  lon: 100.6,
  lat: 18.7,
  startedAt: NOW - 3 * 86_400_000,
  endedAt: NOW,
} as never;
const data = { cyclones: [cyclone], volcanoes: [volcano], fires: [fire], floods: [flood] };

describe("finding what was clicked", () => {
  it("resolves each kind by its own id", () => {
    expect(findSubject("cyclone:TC1", data)?.kind).toBe("cyclone");
    expect(findSubject("volcano:VO1", data)?.kind).toBe("volcano");
    expect(findSubject("fire:WF1", data)?.kind).toBe("fire");
    expect(findSubject("flood:FL1", data)?.kind).toBe("flood");
  });

  it("has nothing for a mark that has aged out of its feed", () => {
    /*
     * The feeds refresh every ten minutes. A card built from a snapshot would keep describing a storm
     * the feed had dropped, so a vanished subject means no card rather than a frozen one.
     */
    expect(findSubject("cyclone:GONE", data)).toBeNull();
    expect(findSubject(null, data)).toBeNull();
    expect(findSubject("nonsense", data)).toBeNull();
  });

  it("does not confuse two kinds sharing an id", () => {
    const shared = {
      cyclones: [{ ...(cyclone as object), id: "X" } as never],
      volcanoes: [{ ...(volcano as object), id: "X" } as never],
      fires: [],
      floods: [],
    };
    expect(findSubject("volcano:X", shared)?.kind).toBe("volcano");
    expect(findSubject("cyclone:X", shared)?.kind).toBe("cyclone");
  });

  it("keeps an id containing a colon whole", () => {
    // USGS-style identifiers carry colons, and splitting on the last one would lose part of the key.
    const odd = { ...data, fires: [{ ...(fire as object), id: "usgs:ab:12" } as never] };
    expect(findSubject("fire:usgs:ab:12", odd)?.kind).toBe("fire");
  });
});

describe("what each card says", () => {
  it("gives a storm its peak wind and the scale that reads it", () => {
    const { title, lines } = linesFor(findSubject("cyclone:TC1", data)!, NOW);
    expect(title).toBe("SAUDEL-26");
    const wind = lines.find((l) => l.label === "Peak wind")!;
    expect(wind.value).toContain("222 km/h");
    // GDACS's own label describes a different moment, so the scale is applied here. See cyclones.ts.
    expect(wind.value).toMatch(/category/i);
  });

  it("says a volcano is not erupting, which is the one thing this layer must not imply", () => {
    const card = linesFor(findSubject("volcano:VO1", data)!, NOW);
    expect(card.note).toContain("Not erupting now");
    expect(card.lines.find((l) => l.label === "Episode ended")).toBeTruthy();
  });

  it("gives a fire its area in both units and how long it has burned", () => {
    const { lines } = linesFor(findSubject("fire:WF1", data)!, NOW);
    expect(lines.find((l) => l.label === "Burned")!.value).toBe("34,160 ha · 342 km²");
    expect(lines.find((l) => l.label === "Burning")!.value).toBe("9 days");
  });

  it("admits a flood has no severity to report", () => {
    const card = linesFor(findSubject("flood:FL1", data)!, NOW);
    expect(card.note).toContain("does not rate them");
  });

  it("omits a row rather than showing a dash when the feed carries nothing", () => {
    const thin = {
      ...data,
      fires: [{ ...(fire as object), hectares: null, startedAt: null, endedAt: null } as never],
      cyclones: [{ ...(cyclone as object), peakKmh: null, track: [] } as never],
    };
    const fireCard = linesFor(findSubject("fire:WF1", thin)!, NOW);
    expect(fireCard.lines.map((l) => l.label)).toEqual(["Position"]);
    const stormCard = linesFor(findSubject("cyclone:TC1", thin)!, NOW);
    expect(stormCard.lines.map((l) => l.label)).toEqual(["Position"]);
  });
});

describe("an archived day changes the tense, not the facts", () => {
  it("stops saying now about a day that has already happened", () => {
    /*
     * These notes were written when the archive withheld the four layers, so "running now" could not be
     * wrong. A past day draws them now, and the card is where somebody goes for the detail.
     */
    expect(linesFor(findSubject("cyclone:TC1", data)!, NOW, true).note).toBe(
      "Tropical cyclone, running that day.",
    );
    expect(linesFor(findSubject("fire:WF1", data)!, NOW, true).note).toBe("Forest fire burning that day.");
    expect(linesFor(findSubject("flood:FL1", data)!, NOW, true).note).toBe(
      "Flood running that day. This feed does not rate them.",
    );
  });

  it("keeps the volcano's refusal in both tenses, because that is the claim it must never make", () => {
    expect(linesFor(findSubject("volcano:VO1", data)!, NOW, false).note).toContain("Not erupting now");
    expect(linesFor(findSubject("volcano:VO1", data)!, NOW, true).note).toContain("Not erupting then");
  });

  it("leaves live copy exactly as it was", () => {
    for (const id of ["cyclone:TC1", "fire:WF1", "flood:FL1"]) {
      expect(linesFor(findSubject(id, data)!, NOW).note).toContain("now");
    }
  });

  it("does not touch the rows, which are measurements either way", () => {
    const live = linesFor(findSubject("fire:WF1", data)!, NOW);
    const past = linesFor(findSubject("fire:WF1", data)!, NOW, true);
    expect(past.lines).toEqual(live.lines);
    expect(past.title).toBe(live.title);
  });
});
