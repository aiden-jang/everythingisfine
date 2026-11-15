import { expect, test } from "vitest";
import { createFrameBudget } from "./frameBudget";

test("sustained slow motion lowers resolution with hysteresis and a hard floor", () => {
  const budget = createFrameBudget();
  let now = 1000;
  for (let i = 0; i < 2000; i++) budget.sample((now += 40), false, false);
  expect(budget.scale()).toBeCloseTo(0.6);
  for (let i = 0; i < 60; i++) budget.sample((now += 16.7), false, false);
  expect(budget.scale()).toBeCloseTo(0.6);
  for (let i = 0; i < 2500; i++) budget.sample((now += 16.7), false, false);
  expect(budget.scale()).toBeCloseTo(1);
});
test("isolated stalls, hidden tabs and idle redraws do not reduce resolution", () => {
  for (const [gap, hidden] of [
    [1000, false],
    [40, true],
    [4, false],
  ] as const) {
    const budget = createFrameBudget();
    for (let i = 0; i < 200; i++) budget.sample(i * gap, false, hidden);
    expect(budget.scale()).toBe(1);
  }
  const budget = createFrameBudget();
  for (let i = 0; i < 300; i++) budget.sample(i * (i % 100 === 0 ? 60 : 16.7), false, false);
  expect(budget.scale()).toBe(1);
});
test("reduced motion restores native resolution", () => {
  const budget = createFrameBudget();
  for (let i = 0; i < 200; i++) budget.sample(i * 40, false, false);
  expect(budget.scale()).toBeLessThan(1);
  expect(budget.sample(9000, true, false)).toBe(true);
  expect(budget.scale()).toBe(1);
});

test("two draws in the same browser frame do not hide sustained slow pacing", () => {
  const budget = createFrameBudget();
  for (let i = 0; i < 200; i++) {
    budget.sample(i * 40, false, false);
    budget.sample(i * 40 + 1, false, false);
  }
  expect(budget.scale()).toBeLessThan(1);
});
