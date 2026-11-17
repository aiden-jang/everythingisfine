import { describe, expect, it } from "vitest";
import { observationReadiness } from "./observationReadiness";

describe("atomic observation readiness", () => {
  it("waits for both readings and their raster on first load or source replacement", () => {
    expect(observationReadiness({ hasFrame: false, loadingData: true, raster: false, image: "ready" })).toBe(
      "preparing",
    );
    expect(observationReadiness({ hasFrame: true, loadingData: false, raster: true, image: "loading" })).toBe(
      "preparing",
    );
    expect(observationReadiness({ hasFrame: true, loadingData: false, raster: true, image: "ready" })).toBe(
      "ready",
    );
  });
  it("ends retention on failure and does not wait for images a frame does not use", () => {
    expect(observationReadiness({ hasFrame: true, loadingData: false, raster: true, image: "failed" })).toBe(
      "unavailable",
    );
    expect(observationReadiness({ hasFrame: false, loadingData: false, raster: false, image: "ready" })).toBe(
      "unavailable",
    );
    expect(observationReadiness({ hasFrame: true, loadingData: true, raster: false, image: "loading" })).toBe(
      "ready",
    );
  });
});
