import { expect, it } from "vitest";
import type { FeedSnapshot } from "./feed";
import { earthquakeCoverage, earthquakeEmpty, earthquakeReach } from "./earthquakeStatus";
import { sharedEarthquakeNotice, sharedHazardNotice } from "./linkNotices";

const day = 86_400_000;
const now = new Date(2026, 10, 6, 12).getTime();
const snapshot: Pick<FeedSnapshot, "archive" | "covered" | "statuses" | "seedFailed"> = {
  archive: null,
  covered: { usgs: now - 7 * day, emsc: now - 2 * day },
  statuses: { usgs: { kind: "live", since: now }, emsc: { kind: "live", since: now } },
  seedFailed: {},
};

it("reports the coverage of the selected source and dates earlier days", () => {
  const filters = { minMagnitude: 2, windowMs: 7 * day, sources: new Set(["emsc"] as const) };
  const coverage = earthquakeCoverage(snapshot, filters, now);
  expect(coverage).toMatchObject({ from: now - 2 * day, partial: true, waiting: false });
  expect(coverage.label).toMatch(/Partial source coverage · since 4 Nov 2026 at /);
  expect(earthquakeCoverage(snapshot, { ...filters, sources: new Set(["usgs"]) }, now).partial).toBe(false);
});

it("keeps the source row and coverage note in agreement while a second backfill is pending", () => {
  const pending = { ...snapshot, covered: { ...snapshot.covered, emsc: null } };
  const waiting = earthquakeReach(pending, now, day);
  expect(waiting.rows[1]?.words).toBe("Waiting");
  expect(waiting.note).toBe("Waiting for earlier reports from EMSC.");

  const disconnected = {
    ...pending,
    statuses: { ...pending.statuses, emsc: { kind: "failing", reason: "connection lost", retryAt: now } },
  } satisfies typeof pending;
  expect(earthquakeReach(disconnected, now, day)).toEqual(waiting);
  expect(sharedEarthquakeNotice("emsc:missing", disconnected, null, false)).toBeNull();

  const failed = earthquakeReach({ ...pending, seedFailed: { emsc: true } }, now, day);
  expect(failed.rows[1]?.words).toBe("Unavailable");
  expect(failed.note).toBe("Earlier reports unavailable from EMSC. Older events are USGS alone.");
  expect(earthquakeReach(snapshot, now, day).note).toBeNull();
});

it("distinguishes an incomplete empty window, loading, an outage, and filtered reports", () => {
  const state = {
    waiting: false,
    unavailable: false,
    earlierUnavailable: false,
    reported: 0,
    archived: false,
    partial: true,
    hasSources: true,
  };
  expect(earthquakeEmpty(state).text).toBe("No earthquakes in available reports.");
  expect(earthquakeEmpty({ ...state, waiting: true }).kind).toBe("loading");
  expect(earthquakeEmpty({ ...state, unavailable: true }).kind).toBe("unavailable");
  expect(earthquakeEmpty({ ...state, reported: 1 }).kind).toBe("filtered");
});

it("waits for the named earthquake source and distinguishes an unanswered backfill", () => {
  const waiting = { ...snapshot, covered: { ...snapshot.covered, emsc: null } };
  expect(sharedEarthquakeNotice("emsc:missing", waiting, null, false)).toBeNull();
  expect(
    sharedEarthquakeNotice("emsc:missing", { ...waiting, seedFailed: { emsc: true } }, null, false),
  ).toBe("Earlier earthquake reports from EMSC are unavailable.");
  expect(sharedEarthquakeNotice("emsc:missing", snapshot, null, false)).toBe(
    "Couldn’t find this earthquake in the available live reports.",
  );
});

it("waits for a shared hazard’s feed before reporting an outage or missing event", () => {
  const layers = { cyclones: "ok", aurora: "ok", volcanoes: "ok", floods: "ok", fires: "pending" } as const;
  expect(sharedHazardNotice("fire:missing", false, null, layers)).toBeNull();
  expect(sharedHazardNotice("fire:missing", false, null, { ...layers, fires: "failed" })).toBe(
    "Live reports for this wildfire couldn’t be reached.",
  );
  expect(sharedHazardNotice("fire:missing", false, null, { ...layers, fires: "ok" })).toBe(
    "Couldn’t find this wildfire in the available live reports.",
  );
});
