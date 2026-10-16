import { expect, it } from "vitest";
import { eventTimestamp } from "./EventTime";

it("distinguishes the two occurrences of a clock time when daylight saving ends", () => {
  const first = eventTimestamp(Date.parse("2026-11-01T05:30:00Z"), "America/New_York");
  const second = eventTimestamp(Date.parse("2026-11-01T06:30:00Z"), "America/New_York");
  expect(first).toContain("01 Nov 2026");
  expect(first).toContain("01:30:00 GMT-4");
  expect(second).toContain("01:30:00 GMT-5");
});

it("shows the local calendar date across midnight without changing the underlying instant", () => {
  const at = Date.parse("2026-10-16T00:15:00Z");
  expect(eventTimestamp(at, "America/New_York")).toContain("15 Oct 2026, 20:15:00 GMT-4");
  expect(eventTimestamp(at, "Asia/Seoul")).toContain("16 Oct 2026, 09:15:00 GMT+9");
});
