import { describe, expect, it } from "vitest";
import { searchStories } from "../storyIndex";
import { journeys, onward } from "./catalogue";

describe("catalogue journeys", () => {
  it("gives every discoverable experience a different, existing onward destination", () => {
    const ids = searchStories.map(({ id }) => id).sort();
    expect(Object.keys(onward).sort()).toEqual(ids);
    for (const [id, [next, reason]] of Object.entries(onward)) {
      expect(ids).toContain(next);
      expect(next).not.toBe(id);
      expect(reason.trim().length).toBeGreaterThan(20);
    }
  });
  it("keeps guided paths finite, unique, and explicit about each source and period", () => {
    expect(new Set(journeys.map(({ id }) => id)).size).toBe(journeys.length);
    for (const journey of journeys) {
      expect(journey.steps.length).toBeGreaterThanOrEqual(3);
      expect(journey.steps.length).toBeLessThanOrEqual(4);
      expect(new Set(journey.steps.map(({ id }) => id)).size).toBe(journey.steps.length);
      for (const step of journey.steps) {
        expect(searchStories.some(({ id }) => id === step.id)).toBe(true);
        expect(step.context).not.toBe("");
        expect(step.prompt).not.toBe("");
      }
      expect(journey.ending).not.toBe("");
    }
  });
});
