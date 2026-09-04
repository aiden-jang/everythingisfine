import { describe, expect, it } from "vitest";
import { hazardCount, hazardGroups, outsideWindowNote } from "./hazards";

const storm = (id: string, name: string, peakKmh: number | null) =>
  ({ id, name, lon: 130, lat: 18, peakKmh, track: [], startedAt: null, endedAt: null }) as never;
const fire = (id: string, country: string, hectares: number | null) =>
  ({ id, country, lon: 18, lat: -12, hectares, startedAt: null, endedAt: null }) as never;
const flood = (id: string, country: string, startedAt: number | null) =>
  ({ id, country, lon: 100, lat: 18, startedAt, endedAt: null }) as never;
const volcano = (id: string, name: string, endedAt: number | null) =>
  ({ id, name, country: "Italy", lon: 15, lat: 37.7, endedAt }) as never;

const none = { cyclones: [], volcanoes: [], fires: [], floods: [] };
/** Fixed, so "3d ongoing" is a fact about the fixture and not about when the suite ran. */
const NOW = 1_000_000_000_000;

describe("ordering each layer by the question it invites", () => {
  it("ranks storms by peak wind, hardest first", () => {
    const [group] = hazardGroups(
      {
        ...none,
        cyclones: [storm("a", "Weak", 90), storm("b", "Strong", 241), storm("c", "Middling", 150)],
      },
      NOW,
    );
    expect(group!.rows.map((r) => r.name)).toEqual(["Strong", "Middling", "Weak"]);
    expect(group!.rows[0]!.measure).toBe("241 km/h");
  });

  it("ranks fires by burned area and states it in the legend's own unit", () => {
    const [group] = hazardGroups(
      {
        ...none,
        fires: [fire("a", "Angola", 9_673), fire("b", "Australia", 139_348)],
      },
      NOW,
    );
    expect(group!.rows.map((r) => r.name)).toEqual(["Australia", "Angola"]);
    // km², matching the legend's total, so the two read as the same quantity.
    expect(group!.rows[0]!.measure).toBe("1,393 km²");
  });

  it("ranks floods newest first and offers no measure, because the feed has none", () => {
    const [group] = hazardGroups(
      {
        ...none,
        floods: [flood("a", "Peru", 1_000), flood("b", "Thailand", 5_000)],
      },
      NOW,
    );
    expect(group!.rows.map((r) => r.name)).toEqual(["Thailand", "Peru"]);
    // Inventing a rank would imply a severity this feed files as magnitude zero for every row.
    expect(group!.rows.every((r) => r.measure === "")).toBe(true);
  });

  it("ranks volcanoes by how recent the episode was", () => {
    const [group] = hazardGroups(
      {
        ...none,
        volcanoes: [volcano("a", "Old", 1_000), volcano("b", "Recent", 9_000)],
      },
      NOW,
    );
    expect(group!.rows.map((r) => r.name)).toEqual(["Recent", "Old"]);
  });
});

describe("what the list says about itself", () => {
  it("uses the same identity the globe picks by", () => {
    const groups = hazardGroups({ ...none, cyclones: [storm("TC1", "SAUDEL-26", 222)] }, NOW);
    expect(groups[0]!.rows[0]!.id).toBe("cyclone:TC1");
  });

  it("counts and pluralises, so a collapsed group still says how much is in it", () => {
    const one = hazardGroups({ ...none, fires: [fire("a", "Angola", 10)] }, NOW);
    expect(one[0]!.label).toBe("1 fire");
    const many = hazardGroups({ ...none, fires: [fire("a", "A", 10), fire("b", "B", 20)] }, NOW);
    expect(many[0]!.label).toBe("2 fires");
    expect(hazardCount(many)).toBe(2);
  });

  it("leaves out a layer that has nothing in it rather than showing an empty group", () => {
    expect(hazardGroups(none, NOW)).toEqual([]);
    expect(hazardCount([])).toBe(0);
    const only = hazardGroups({ ...none, floods: [flood("a", "Peru", 1)] }, NOW);
    expect(only.map((g) => g.kind)).toEqual(["flood"]);
  });

  it("falls back to a kind name when the feed gives no country", () => {
    const groups = hazardGroups({ ...none, fires: [fire("a", "", 10)] }, NOW);
    expect(groups[0]!.rows[0]!.name).toBe("Forest fire");
  });

  it("survives a missing measure without printing a dash", () => {
    const groups = hazardGroups({ ...none, cyclones: [storm("a", "Unnamed", null)] }, NOW);
    expect(groups[0]!.rows[0]!.measure).toBe("");
  });
});

describe("saying that the window emptied a layer", () => {
  const DAY = 86_400_000;
  const tally = (
    kind: "cyclone" | "fire" | "flood" | "volcano",
    held: number,
    shown: number,
    newest: number | null = NOW - 10 * DAY,
  ) => ({ kind, held, shown, newest });

  it("says nothing when every layer the feed holds is on screen", () => {
    expect(outsideWindowNote([tally("fire", 3, 3), tally("flood", 2, 2)], NOW)).toBeNull();
  });

  it("says nothing about a layer the feed itself has none of, which is not the filter's doing", () => {
    expect(outsideWindowNote([tally("volcano", 0, 0)], NOW)).toBeNull();
  });

  it("names only the layers the window emptied", () => {
    const note = outsideWindowNote([tally("cyclone", 12, 0), tally("fire", 7, 7)], NOW);
    expect(note).toContain("No storms are in this window");
    expect(note).toContain("holds 12");
    expect(note).not.toContain("fires");
  });

  it("joins several layers into a sentence rather than a list", () => {
    const note = outsideWindowNote(
      [tally("cyclone", 2, 0), tally("fire", 3, 0), tally("flood", 4, 0), tally("volcano", 1, 1)],
      NOW,
    );
    expect(note).toContain("No storms, fires and floods are in this window");
    // The totals are added across the emptied layers only, so the number matches what widening would show.
    expect(note).toContain("holds 9");
  });

  it("speaks of the marks as a whole once the window has emptied all of them", () => {
    const note = outsideWindowNote(
      [tally("cyclone", 2, 0), tally("fire", 3, 0), tally("flood", 4, 0), tally("volcano", 1, 0)],
      NOW,
    );
    expect(note).toContain("None of the marks are in this window");
  });

  it("says how far back the reader would have to widen, from the newest that is missing", () => {
    const note = outsideWindowNote([tally("fire", 5, 0, NOW - 23 * DAY)], NOW);
    expect(note).toContain("the newest 23 days back");
  });

  it("names the window that would show them, rather than saying widen", () => {
    // Smallest that reaches: a month to find a three-day-old flood buries it in everything else.
    expect(outsideWindowNote([tally("flood", 2, 0, NOW - 3 * DAY)], NOW)).toContain("so try 7d.");
    expect(outsideWindowNote([tally("fire", 2, 0, NOW - 23 * DAY)], NOW)).toContain("so try 30d.");
  });

  it("falls back to widening in general when nothing offered reaches that far", () => {
    const note = outsideWindowNote([tally("volcano", 2, 0, NOW - 400 * DAY)], NOW);
    expect(note).toContain("widen the window");
  });

  it("leaves the distance out rather than guessing when the layer carries no dates", () => {
    const note = outsideWindowNote([tally("fire", 5, 0, null)], NOW);
    expect(note).toContain("holds 5, so widen");
  });
});
