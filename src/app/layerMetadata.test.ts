import { expect, it } from "vitest";
import { layerHealth } from "./layerMetadata";
import type { FeedRow } from "./feedStatus";

const row = (id: FeedRow["id"], state: FeedRow["state"], message?: string): FeedRow => ({
  id,
  state,
  label: id,
  lastCheck: undefined,
  message,
});
it("shows partial earthquake availability without treating a working agency as failed", () => {
  expect(layerHealth("earthquakes", [row("usgs", "failed"), row("emsc", "ok")])).toBe(
    "Partial source availability",
  );
  expect(layerHealth("earthquakes", [row("usgs", "failed"), row("emsc", "failed")])).toBe("Feed unavailable");
  expect(layerHealth("earthquakes", [row("usgs", "pending"), row("emsc", "ok")])).toBe("Checking source…");
  expect(
    layerHealth("earthquakes", [row("usgs", "ok"), row("emsc", "ok"), row("radar", "failed")]),
  ).toBeNull();
});
it("retains provider-specific empty and delayed weather explanations", () => {
  expect(layerHealth("wind", [row("wind", "ok", "Available · no recent data")])).toBe(
    "Available · no recent data",
  );
  expect(layerHealth("radar", [row("radar", "ok", "Available · latest scan delayed")])).toBe(
    "Available · latest scan delayed",
  );
});
