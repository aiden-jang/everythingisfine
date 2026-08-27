import { describe, expect, it } from "vitest";
import { reportedBy } from "./gdacs";

describe("who reported it", () => {
  it("reads the agency GDACS credits", () => {
    // A Pacific typhoon comes from the Joint Typhoon Warning Center, and GDACS says so on every event.
    expect(reportedBy({ source: "JTWC" })).toBe("JTWC");
    expect(reportedBy({ source: "  GVP  " })).toBe("GVP");
  });

  it("says nothing rather than an empty string", () => {
    // A blank reaching a label would render as a dangling separator with nothing after it.
    for (const bad of [undefined, null, "", "   ", 7, {}]) {
      expect(reportedBy({ source: bad } as Record<string, unknown>), String(bad)).toBeNull();
    }
    expect(reportedBy({})).toBeNull();
  });
});
