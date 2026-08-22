import { describe, expect, it } from "vitest";
import { createFeed } from "./feed";
import type { Reading } from "../data/types";

/*
 * The mode, not the fetch. What matters here is that an archived day cannot be mistaken for now:
 * the live sources are off, the set is replaced rather than mixed, and the snapshot says so.
 */

const reading = (over: Partial<Reading> = {}): Reading => ({
  source: "usgs", id: "a1", magnitude: 5.0, scale: "mww", lon: 141, lat: 38, depthKm: 30,
  time: Date.parse("2026-07-04T05:00:00Z"), place: "somewhere", kind: "earthquake",
  receivedAt: Date.now(), ...over,
});

const SPAN = {
  from: Date.parse("2026-07-04T00:00:00Z"),
  to: Date.parse("2026-07-05T00:00:00Z"),
};

describe("showing an archived day", () => {
  it("says on the snapshot that this is not live", () => {
    const feed = createFeed(100);
    expect(feed.snapshot().archive).toBeNull();
    feed.showArchive(SPAN, [reading()]);
    expect(feed.snapshot().archive).toEqual(SPAN);
  });

  it("replaces the set rather than adding to it", () => {
    /*
     * The failure this prevents is a day that never happened: yesterday's events plus whatever the
     * socket pushed while you were reading them.
     */
    const feed = createFeed(100);
    feed.store.ingest(reading({ id: "live1", time: Date.now() }));
    expect(feed.snapshot().stats.quakes).toBe(1);
    feed.showArchive(SPAN, [reading({ id: "old1" }), reading({ id: "old2", lon: 10, lat: 10 })]);
    expect(feed.snapshot().stats.quakes).toBe(2);
    let ids: string[] = [];
    feed.store.forEach((q) => { ids = ids.concat(q.readings.map((r) => r.id)); });
    expect(ids).not.toContain("live1");
  });

  it("vouches for the span it asked for, both ends", () => {
    const feed = createFeed(100);
    feed.showArchive(SPAN, [reading()]);
    const snap = feed.snapshot();
    expect(snap.coveredSince).toBe(SPAN.from);
    expect(snap.covered.usgs).toBe(SPAN.from);
    expect(snap.covered.emsc).toBe(SPAN.from);
  });

  it("counts as a seed, so a day of events is not a day of wavefronts", () => {
    // `seeding` is what `frontsFor` reads to fire one front for a batch instead of three.
    const feed = createFeed(100);
    feed.showArchive(SPAN, [reading(), reading({ id: "a2", lon: 20, lat: 20 })]);
    expect(feed.snapshot().seeding).toBe(true);
  });

  it("bumps the revision, so everything reading the store recomputes", () => {
    const feed = createFeed(100);
    const before = feed.snapshot().revision;
    feed.showArchive(SPAN, [reading()]);
    expect(feed.snapshot().revision).toBeGreaterThan(before);
  });
});

describe("coming back to live", () => {
  it("drops the archive and empties what it was showing", () => {
    const feed = createFeed(100);
    feed.showArchive(SPAN, [reading(), reading({ id: "a2", lon: 20, lat: 20 })]);
    feed.resumeLive();
    const snap = feed.snapshot();
    expect(snap.archive).toBeNull();
    expect(snap.stats.quakes).toBe(0);
    // Nothing is vouched for until a live source has actually seeded again.
    expect(snap.coveredSince).toBeNull();
  });

  it("can go back and forth without leaking either set into the other", () => {
    const feed = createFeed(100);
    feed.showArchive(SPAN, [reading({ id: "july" })]);
    feed.resumeLive();
    feed.store.ingest(reading({ id: "now", time: Date.now() }));
    feed.showArchive(SPAN, [reading({ id: "july" })]);
    let ids: string[] = [];
    feed.store.forEach((q) => { ids = ids.concat(q.readings.map((r) => r.id)); });
    expect(ids).toEqual(["july"]);
  });
});
