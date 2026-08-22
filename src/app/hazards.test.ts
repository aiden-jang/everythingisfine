import { describe, expect, it } from "vitest";
import { hazardCount, hazardGroups } from "./hazards";

const storm = (id: string, name: string, peakKmh: number | null) =>
  ({ id, name, lon: 130, lat: 18, peakKmh, track: [] }) as never;
const fire = (id: string, country: string, hectares: number | null) =>
  ({ id, country, lon: 18, lat: -12, hectares, startedAt: null, endedAt: null }) as never;
const flood = (id: string, country: string, startedAt: number | null) =>
  ({ id, country, lon: 100, lat: 18, startedAt, endedAt: null }) as never;
const volcano = (id: string, name: string, endedAt: number | null) =>
  ({ id, name, country: "Italy", lon: 15, lat: 37.7, endedAt }) as never;

const none = { cyclones: [], volcanoes: [], fires: [], floods: [] };

describe("ordering each layer by the question it invites", () => {
  it("ranks storms by peak wind, hardest first", () => {
    const [group] = hazardGroups({
      ...none,
      cyclones: [storm("a", "Weak", 90), storm("b", "Strong", 241), storm("c", "Middling", 150)],
    });
    expect(group!.rows.map((r) => r.name)).toEqual(["Strong", "Middling", "Weak"]);
    expect(group!.rows[0]!.measure).toBe("241 km/h");
  });

  it("ranks fires by burned area and states it in the legend's own unit", () => {
    const [group] = hazardGroups({
      ...none, fires: [fire("a", "Angola", 9_673), fire("b", "Australia", 139_348)],
    });
    expect(group!.rows.map((r) => r.name)).toEqual(["Australia", "Angola"]);
    // km², matching the legend's total, so the two read as the same quantity.
    expect(group!.rows[0]!.measure).toBe("1,393 km²");
  });

  it("ranks floods newest first and offers no measure, because the feed has none", () => {
    const [group] = hazardGroups({
      ...none,
      floods: [flood("a", "Peru", 1_000), flood("b", "Thailand", 5_000)],
    });
    expect(group!.rows.map((r) => r.name)).toEqual(["Thailand", "Peru"]);
    // Inventing a rank would imply a severity this feed files as magnitude zero for every row.
    expect(group!.rows.every((r) => r.measure === "")).toBe(true);
  });

  it("ranks volcanoes by how recent the episode was", () => {
    const [group] = hazardGroups({
      ...none,
      volcanoes: [volcano("a", "Old", 1_000), volcano("b", "Recent", 9_000)],
    });
    expect(group!.rows.map((r) => r.name)).toEqual(["Recent", "Old"]);
  });
});

describe("what the list says about itself", () => {
  it("uses the same identity the globe picks by", () => {
    const groups = hazardGroups({ ...none, cyclones: [storm("TC1", "SAUDEL-26", 222)] });
    expect(groups[0]!.rows[0]!.id).toBe("cyclone:TC1");
  });

  it("counts and pluralises, so a collapsed group still says how much is in it", () => {
    const one = hazardGroups({ ...none, fires: [fire("a", "Angola", 10)] });
    expect(one[0]!.label).toBe("1 fire");
    const many = hazardGroups({ ...none, fires: [fire("a", "A", 10), fire("b", "B", 20)] });
    expect(many[0]!.label).toBe("2 fires");
    expect(hazardCount(many)).toBe(2);
  });

  it("leaves out a layer that has nothing in it rather than showing an empty group", () => {
    expect(hazardGroups(none)).toEqual([]);
    expect(hazardCount([])).toBe(0);
    const only = hazardGroups({ ...none, floods: [flood("a", "Peru", 1)] });
    expect(only.map((g) => g.kind)).toEqual(["flood"]);
  });

  it("falls back to a kind name when the feed gives no country", () => {
    const groups = hazardGroups({ ...none, fires: [fire("a", "", 10)] });
    expect(groups[0]!.rows[0]!.name).toBe("Forest fire");
  });

  it("survives a missing measure without printing a dash", () => {
    const groups = hazardGroups({ ...none, cyclones: [storm("a", "Unnamed", null)] });
    expect(groups[0]!.rows[0]!.measure).toBe("");
  });
});
