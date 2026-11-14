import { expect, it } from "vitest";
import { quietLayer } from "./layerQuiet";
import type { FeedRow } from "./feedStatus";
const row = (id: FeedRow["id"], state: FeedRow["state"]): FeedRow => ({
  id,
  state,
  label: id,
  lastCheck: undefined,
});
it("never describes pending or failed sources as empty observations", () => {
  expect(quietLayer("fires", [row("fires", "failed")], 0)).toBe("Feed unavailable");
  expect(quietLayer("fires", [row("fires", "pending")], 0)).toBe("Checking source…");
  expect(quietLayer("fires", [], 0)).toBe("Waiting for source data…");
  expect(quietLayer("fires", [row("fires", "ok")], 0)).toBe("No matching reports in this time window");
  expect(quietLayer("earthquakes", [row("usgs", "ok"), row("emsc", "failed")], 0)).toBe(
    "Partial source availability",
  );
  expect(quietLayer("fires", [row("fires", "failed")], 0, true)).toBe(
    "No matching reports in this time window",
  );
});
it("explains coverage without claiming that a blank map is safe or dry", () => {
  expect(quietLayer("radar", [row("radar", "ok")])).toContain("blank does not always mean dry");
  expect(quietLayer("lightning", [row("lightning", "ok")], 0)).toContain("GOES-East coverage only");
  expect(quietLayer("aurora", [row("aurora", "ok")])).toContain("poles");
  expect(quietLayer("fires", [row("fires", "ok")], 3)).toBeNull();
  expect(quietLayer("wind", [row("wind", "ok")], 0)).toBe("No wind vectors in this forecast step");
  expect(quietLayer("aurora", [row("aurora", "ok")], 0)).toBe("No modeled auroral activity in this forecast");
});
