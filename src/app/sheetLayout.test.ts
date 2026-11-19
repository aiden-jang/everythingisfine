import { describe, expect, it } from "vitest";
import { sheetStops } from "./sheetLayout";

describe("phone sheet space", () => {
  it("keeps the existing stops when no footer space is reserved", () => {
    expect(sheetStops(844)).toEqual([180, 363, 692]);
  });

  it("reserves the credit without squeezing controls below the viewport", () => {
    expect(sheetStops(844, 60)).toEqual([150, 303, 632]);
    expect(sheetStops(375, 60)).toEqual([150, 210, 248]);
    expect(sheetStops(375, 94)).toEqual([150, 176, 214]);
  });

  it("keeps ordered snap positions across portrait, landscape and safe areas", () => {
    for (const height of [240, 320, 375, 640, 844, 900]) {
      for (const footer of [60, 94]) {
        const [first, half, last] = sheetStops(height, footer);
        expect(first).toBeGreaterThan(0);
        expect(half).toBeGreaterThanOrEqual(first);
        expect(last).toBeGreaterThanOrEqual(half);
        expect(last + footer).toBeLessThanOrEqual(height * 0.82 + 1);
      }
    }
  });
});
