import { describe, expect, it } from "vitest";
import { radarFeedHealth } from "./radarFeedHealth";

const ready = {
  status: "ready",
  image: "ok",
  checkedAt: 3_000_000,
  latestAt: 2_900_000,
  lastSuccess: 3_000_000,
} as const;

describe("radar source health", () => {
  it("waits for imagery rather than calling a successful catalogue a usable layer", () => {
    expect(radarFeedHealth({ ...ready, status: "loading", lastSuccess: undefined })).toMatchObject({
      state: "pending",
      lastCheck: undefined,
    });
    expect(radarFeedHealth({ ...ready, image: "pending" })).toMatchObject({ state: "pending" });
    expect(radarFeedHealth({ ...ready, image: "failed" })).toMatchObject({
      state: "failed",
      message: "Latest radar image unavailable",
    });
    expect(radarFeedHealth(ready)).toMatchObject({ state: "ok", lastCheck: ready.lastSuccess });
  });

  it("distinguishes an empty answer, delayed observations and a failed refresh", () => {
    expect(radarFeedHealth({ ...ready, status: "empty", image: "pending" })).toMatchObject({
      state: "ok",
      message: "Available · no recent scans",
    });
    expect(radarFeedHealth({ ...ready, latestAt: 1_000_000 })).toMatchObject({
      state: "ok",
      message: "Available · latest scan delayed",
    });
    expect(radarFeedHealth({ ...ready, status: "error", checkedAt: 4_000_000 })).toMatchObject({
      state: "failed",
      lastCheck: ready.lastSuccess,
    });
  });
});
