import { describe, expect, it, vi } from "vitest";
import { ARCHIVE_LIMIT, dayRange, fetchArchive } from "./archive";

const usgsBody = (n: number) => ({
  features: Array.from({ length: n }, (_, i) => ({
    id: `us${i}`,
    properties: {
      mag: 4.5,
      place: "10 km N of Somewhere",
      time: Date.parse("2026-07-04T05:00:00Z") + i,
      updated: 1,
      magType: "mww",
      type: "earthquake",
    },
    geometry: { coordinates: [140, 38, 30] },
  })),
});
const emscBody = (n: number) => ({
  features: Array.from({ length: n }, (_, i) => ({
    id: `em${i}`,
    properties: {
      mag: 4.4,
      magtype: "mw",
      flynn_region: "SOMEWHERE",
      time: "2026-07-04T05:00:01Z",
      lat: 38.05,
      lon: 140.05,
      depth: 28,
      unid: `e${i}`,
      lastupdate: "2026-07-04T05:01:00Z",
    },
  })),
});
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("asking both agencies for a day that has already happened", () => {
  it("asks each for the span, with the row limit and the magnitude floor", async () => {
    const seen: string[] = [];
    const get = vi.fn(async (url: string) => {
      seen.push(url);
      return ok(url.includes("usgs") ? usgsBody(2) : emscBody(2));
    });
    const span = dayRange("2026-07-04")!;
    await fetchArchive(span.from, span.to, 2.5, get);
    expect(seen).toHaveLength(2);
    for (const url of seen) {
      expect(url).toContain("2026-07-04T00:00:00");
      expect(url).toContain(`limit=${ARCHIVE_LIMIT}`);
      expect(url).toMatch(/minmag(nitude)?=2\.5/);
    }
    // The end is the following midnight, so a day is a whole day and not 23 hours and change.
    expect(seen[0]).toContain("2026-07-05T00:00:00");
  });

  it("merges both agencies through the live parsers", async () => {
    const get = async (url: string) => ok(url.includes("usgs") ? usgsBody(3) : emscBody(2));
    const span = dayRange("2026-07-04")!;
    const got = await fetchArchive(span.from, span.to, 2, get);
    expect(got.readings.filter((r) => r.source === "usgs")).toHaveLength(3);
    expect(got.readings.filter((r) => r.source === "emsc")).toHaveLength(2);
    expect(got.answered.usgs).toEqual({ count: 3, truncated: false });
    expect(got.answered.emsc).toEqual({ count: 2, truncated: false });
  });

  it("says when an answer came back at the row limit, rather than calling it a whole day", async () => {
    const get = async (url: string) => ok(url.includes("usgs") ? usgsBody(ARCHIVE_LIMIT) : emscBody(1));
    const got = await fetchArchive(0, 86_400_000, 2, get);
    expect(got.answered.usgs!.truncated).toBe(true);
    expect(got.answered.emsc!.truncated).toBe(false);
  });

  it("distinguishes an agency that did not answer from one that answered nothing", async () => {
    /*
     * Null and zero are different facts, and only one of them is the agency's day being quiet. The
     * live path makes the same distinction for a dead feed.
     */
    const get = async (url: string) => {
      if (url.includes("usgs")) throw new Error("offline");
      return ok(emscBody(0));
    };
    const got = await fetchArchive(0, 86_400_000, 2, get);
    expect(got.answered.usgs).toBeNull();
    expect(got.answered.emsc).toEqual({ count: 0, truncated: false });
    expect(got.readings).toEqual([]);
  });

  it("survives a refusal from either side without losing the other", async () => {
    const get = async (url: string) =>
      url.includes("usgs") ? new Response("", { status: 503 }) : ok(emscBody(2));
    const got = await fetchArchive(0, 86_400_000, 2, get);
    expect(got.answered.usgs).toBeNull();
    expect(got.readings).toHaveLength(2);
  });
});

describe("the day a date names", () => {
  it("is midnight to midnight UTC, so a shared day means one day everywhere", () => {
    const span = dayRange("2026-07-04")!;
    expect(new Date(span.from).toISOString()).toBe("2026-07-04T00:00:00.000Z");
    expect(span.to - span.from).toBe(86_400_000);
  });

  it("refuses a date it cannot read rather than defaulting to now", () => {
    expect(dayRange("not-a-day")).toBeNull();
    expect(dayRange("")).toBeNull();
  });
});

describe("the day's end is exclusive, which has bitten once", () => {
  it("ends at the next midnight rather than at 23:59", () => {
    const span = dayRange("2026-05-15")!;
    expect(new Date(span.from).toISOString()).toBe("2026-05-15T00:00:00.000Z");
    expect(new Date(span.to).toISOString()).toBe("2026-05-16T00:00:00.000Z");
  });

  it("so anything labelling a day must use `from`", () => {
    /*
     * The still captioned itself from `to` and named 2026-05-16 over a picture of the 15th, while the
     * rail beside it said the 15th. Pinned here because the fault is in the shape of the span, not in
     * the caption: any future reader deriving a date from `to` gets the next day.
     */
    const span = dayRange("2026-05-15")!;
    expect(new Date(span.to).toISOString().slice(0, 10)).toBe("2026-05-16");
    expect(new Date(span.from).toISOString().slice(0, 10)).toBe("2026-05-15");
  });
});
