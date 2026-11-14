import { expect, it } from "vitest";
import { readVisit, type Visit } from "./library";
import { visitAction, restartVisit } from "./visitAction";
import { restoreVisits } from "./restoreVisits";

const visit: Visit = { id: "aral", seen: 1000, position: { moment: { id: "aral", at: 1000, map: true } } };
it("distinguishes completed stories, unfinished visits and current data without losing old saved views", () => {
  expect(visitAction(visit)).toBe("Continue");
  expect(visitAction({ ...visit, completed: true })).toBe("Watch again");
  expect(readVisit({ ...visit, completed: true })?.completed).toBe(true);
  expect(readVisit({ ...visit, completed: "true" })?.completed).toBeUndefined();
  for (const id of ["radar", "sun", "aurora", "rain", "sky", "meteors", "orbit"])
    expect(visitAction({ ...visit, id, completed: true })).toBe("Open latest");
  expect(visitAction({ ...visit, id: "epic", completed: true })).toBe("Watch again");
  expect(
    visitAction({ ...visit, id: "epic", position: { moment: { id: "epic", choice: "latest", map: false } } }),
  ).toBe("Open latest");
});
it("restarting drops held time and completion but retains the chosen record, city and projection", () => {
  const reset = restartVisit({
    ...visit,
    completed: true,
    position: {
      moment: { id: "epic", at: 1000, choice: "latest", map: true, city: "Seoul" },
      radar: { at: 1000, region: "world", map: true },
      float: { profile: "recorded/6901932/268/1792482240000", index: 61 },
    },
  });
  expect(reset.completed).toBeUndefined();
  expect(reset.position.moment).toEqual({ id: "epic", choice: "latest", city: "Seoul", map: true });
  expect(reset.position.radar).toEqual({ region: "world", map: true });
  expect(reset.position.float?.index).toBe(0);
});
it("undo restores only removed entries without replacing later saves or visits", () => {
  const newer = { ...visit, seen: 2000, position: { moment: { id: "aral", at: 2000, map: false } } };
  const other = { ...visit, id: "water", seen: 3000, position: {} };
  const current = { version: 1 as const, recent: [other], saved: [newer] };
  expect(restoreVisits(current, { list: "saved", items: [visit] }).saved).toEqual([newer]);
  const restored = restoreVisits(current, { list: "recent", items: [visit] });
  expect(restored.recent).toEqual([other, visit]);
  expect(restored.saved).toEqual([newer]);
});
