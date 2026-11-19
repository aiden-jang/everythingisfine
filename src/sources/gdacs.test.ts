import { describe, expect, it, vi } from "vitest";
import { events, fetchList, parseUtc, reportedBy } from "./gdacs";

it("distinguishes an unexpected successful response from a genuinely empty list", async () => {
  const answer = vi.fn();
  for (const [payload, valid] of [
    [{ error: "unavailable" }, false],
    [{ features: [] }, true],
  ] as const) {
    expect(await fetchList("unused", events, async () => Response.json(payload), answer)).toEqual([]);
    expect(answer).toHaveBeenLastCalledWith(valid);
  }
});

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

describe("a GDACS timestamp", () => {
  it("reads a zoneless stamp as UTC, not as wherever the viewer is", () => {
    expect(parseUtc("2026-08-11T21:25:00")).toBe(Date.parse("2026-08-11T21:25:00Z"));
  });

  it("leaves a stamp that already carries a zone alone", () => {
    expect(parseUtc("2026-08-11T21:25:00Z")).toBe(Date.parse("2026-08-11T21:25:00Z"));
    expect(parseUtc("2026-08-11T21:25:00+02:00")).toBe(Date.parse("2026-08-11T19:25:00Z"));
  });

  it("gives back nothing for a field that is not a stamp", () => {
    expect(parseUtc("")).toBeNull();
    expect(parseUtc(null)).toBeNull();
    expect(parseUtc(1_754_000_000_000)).toBeNull();
    expect(parseUtc("not a date")).toBeNull();
  });
});
