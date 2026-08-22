import { describe, expect, it } from "vitest";
import { decode, encode, type Permalink } from "./permalink";
import { MAG_MAX, MAG_MIN } from "../globe/ramp";

const state: Permalink = {
  lon: 145, lat: 12, zoom: 1, minMagnitude: 2, windowHours: 24,
  sources: ["usgs", "emsc"], ramp: "thermal", event: null, section: null, cursor: null, day: null, mark: null,
};

describe("longitude on the way out", () => {
  it("wraps a camera that has been round the world", () => {
    // The spring takes the shortest way round, so crossing the date line adds a turn to `lon` and
    // nothing takes it off again. Links were coming out as at=499.37.
    const at = (lon: number): string => encode({
      lon, lat: 20, zoom: 1, minMagnitude: 2, windowHours: 24,
      sources: ["usgs"], ramp: "thermal", event: null, section: null, cursor: null, day: null, mark: null,
    }).split("&")[0]!;

    expect(at(499.37)).toBe("at=139.37,20,1");
    expect(at(-190)).toBe("at=170,20,1");
    expect(at(180)).toBe("at=-180,20,1");
    expect(at(140)).toBe("at=140,20,1");
  });
});

describe("permalinks", () => {
  it("survives a round trip", () => {
    const full: Permalink = {
      ...state, lon: -71.5, lat: -25.25, zoom: 1.8, minMagnitude: 4.5,
      ramp: "cividis", event: "usgs:us7000abcd",
    };
    expect(decode(encode(full))).toEqual({
      lon: -71.5, lat: -25.25, zoom: 1.8, minMagnitude: 4.5, windowHours: 24,
      sources: ["emsc", "usgs"], ramp: "cividis", event: "usgs:us7000abcd",
    });
  });

  it("names the event the way the agency does, never the way we do", () => {
    const encoded = encode({ ...state, event: "emsc:20260817_0000653" });
    expect(encoded).toContain("e=emsc:20260817_0000653");
    // Our own key is an arrival counter: stable within one page, meaningless across two. A link
    // carrying `q12` would restore a different earthquake, which is worse than restoring none.
    expect(encoded).not.toMatch(/e=q\w+/);
  });

  it("does not claim camera precision it does not have", () => {
    const encoded = encode({ ...state, lon: 145.123456789, lat: 12.987654321 });
    expect(encoded).toContain("at=145.12,12.99,1");
  });

  it("ignores a fragment that is not ours", () => {
    expect(decode("")).toEqual({});
    expect(decode("#section-two")).toEqual({});
    expect(decode("#at=nonsense")).toEqual({});
  });

  it("clamps a hand-edited camera rather than obeying it", () => {
    const out = decode("at=999,-400,50");
    // Longitude wraps, latitude and zoom clamp. A URL is untrusted input in the most ordinary way:
    // people edit them, and an old link outlives the shape it was written against.
    expect(out.lon).toBeCloseTo(-81, 5);
    expect(out.lat).toBe(-85);
    expect(out.zoom).toBe(3);
  });

  it("drops a source or ramp it does not recognise", () => {
    expect(decode("s=usgs,gossip&r=neon")).toEqual({ sources: ["usgs"] });
  });

  it("honours an empty source list, because showing nothing is a real state", () => {
    expect(decode("s=")).toEqual({ sources: [] });
  });

  it("rejects an event identifier that is not shaped like one", () => {
    expect(decode("e=q12").event).toBeUndefined();
    expect(decode("e=usgs:").event).toBeUndefined();
    expect(decode("e=<script>").event).toBeUndefined();
    expect(decode("e=usgs:us7000abcd").event).toBe("usgs:us7000abcd");
  });
});

/*
 * The cross-section, in the link.
 *
 * It is the one piece of state somebody makes rather than chooses, so it is the one most worth
 * sending, and it is also the only one that carries a view: a section has nowhere to be drawn except
 * the map. What needs guarding is what guards every other field here, since a fragment is untrusted
 * input in the most ordinary way, and one extra guard of its own: a line with both ends in the same
 * place finds nothing and reads as a broken link rather than an edited one.
 */
describe("a cross-section in the link", () => {
  const line = { fromLon: 138.5, fromLat: 34.2, toLon: 145.8, toLat: 39.9 };

  it("survives a round trip", () => {
    const out = decode(encode({ ...state, section: line }));
    expect(out.section).toEqual(line);
  });

  it("is absent, not null, when there is no section", () => {
    expect(encode(state)).not.toContain("x=");
    expect(decode(encode(state)).section).toBeUndefined();
  });

  it("writes two decimals, like every other coordinate here", () => {
    // Two places is about 100 metres. A section end written to fourteen is a claim to a precision
    // nobody dragged.
    const out = encode({ ...state, section: { ...line, fromLon: 138.500001234 } });
    expect(out).toContain("x=138.5,34.2,145.8,39.9");
  });

  it("wraps a longitude that has been round the world, as the camera's is", () => {
    // `pick` reads the camera's own accumulating longitude, so a section drawn after crossing the
    // date line a few times has ends past 180 exactly as the camera does.
    const out = decode(encode({ ...state, section: { ...line, fromLon: 498.5 } }));
    expect(out.section?.fromLon).toBe(138.5);
  });

  it("drops a line with both ends in the same place", () => {
    expect(decode("x=10,20,10,20").section).toBeUndefined();
    expect(decode("x=10,20,10.01,20").section).toBeDefined();
  });

  it("drops anything unreadable rather than half-restoring it", () => {
    expect(decode("x=10,20,30").section).toBeUndefined();
    expect(decode("x=10,20,30,40,50").section).toBeUndefined();
    expect(decode("x=10,20,thirty,40").section).toBeUndefined();
    expect(decode("x=").section).toBeUndefined();
  });

  it("clamps a latitude off the end of the world", () => {
    expect(decode("x=0,-400,10,400").section)
      .toEqual({ fromLon: 0, fromLat: -90, toLon: 10, toLat: 90 });
  });
});

describe("the window, which was silently thrown away", () => {
  it("carries a week and a month, which it used to flatten to a day", () => {
    /*
     * The bug this describes: the decoder clamped `w` to 1..24, which was right while a day was the
     * only choice and wrong from the moment 7d and 30d shipped. A link to a month arrived as a day and
     * nothing said so, which is the worst of the three possible outcomes and the reason a round trip is
     * asserted here rather than each direction separately.
     */
    for (const windowHours of [24, 168, 720]) {
      expect(decode(encode({ ...state, windowHours })).windowHours).toBe(windowHours);
    }
  });

  it("snaps a window nobody can select to the nearest one they can", () => {
    /*
     * The rule at the top of `decode`: a link must not leave the app in a state it has no other way to
     * reach. A 100-hour window works arithmetically and would leave the window buttons showing nothing
     * selected, with no way back to whatever the link asked for.
     */
    expect(decode("w=100").windowHours).toBe(168);
    expect(decode("w=1").windowHours).toBe(24);
    expect(decode("w=100000").windowHours).toBe(720);
  });

  it("drops a window that is not a number at all", () => {
    expect(decode("w=soon").windowHours).toBeUndefined();
  });
});

describe("the moment, which the camera never carried", () => {
  const at = 1_700_000_000_000;

  it("round-trips a cursor", () => {
    expect(decode(encode({ ...state, cursor: at })).cursor).toBe(at);
  });

  it("says nothing at all when the view is live", () => {
    // Absent rather than an explicit null, so a live link is the short one it was before this existed.
    expect(encode({ ...state, cursor: null })).not.toContain("c=");
    expect(decode(encode({ ...state, cursor: null })).cursor).toBeUndefined();
  });

  it("keeps seconds and drops the rest, because a strip is 24 buckets wide", () => {
    // Three digits of millisecond precision in a URL is three digits of a claim nobody can read.
    expect(decode(encode({ ...state, cursor: at + 400 })).cursor).toBe(at);
    expect(encode({ ...state, cursor: at })).toContain("c=1700000000");
  });

  it("drops a moment that is not one, rather than clamping to a nearby year", () => {
    /*
     * Unlike a window, there is no nearest valid moment: 1970 and the year 5000 are both simply not
     * what the link meant, so they go the way an unreadable camera goes.
     */
    expect(decode("c=0").cursor).toBeUndefined();
    expect(decode("c=-5").cursor).toBeUndefined();
    expect(decode("c=99999999999999").cursor).toBeUndefined();
    expect(decode("c=yesterday").cursor).toBeUndefined();
  });

  it("does not carry whether it was playing", () => {
    /*
     * A link that arrives already running is motion the recipient did not ask for, which is the same
     * objection DESIGN.md makes to ambient rotation. It arrives held.
     */
    expect(encode({ ...state, cursor: at })).not.toMatch(/p=|play/);
  });
});

describe("bounds read from the controls rather than restated", () => {
  it("carries the top of the magnitude scale, which it used to shave", () => {
    /*
     * The clamp read 0..7 while the slider runs MAG_MIN to MAG_MAX, 1 to 7.5. A filter parked at the top
     * of the scale shared as 7.5 and arrived as 7: the sibling of the window bug, and the same cause, a
     * bound written as a literal instead of read from the thing it bounds.
     */
    expect(MAG_MAX).toBe(7.5);
    expect(decode(encode({ ...state, minMagnitude: MAG_MAX })).minMagnitude).toBe(MAG_MAX);
  });

  it("refuses a threshold below the floor the slider has", () => {
    // A link must not put the app where no control can. The slider cannot go under MAG_MIN.
    expect(decode("m=0").minMagnitude).toBe(MAG_MIN);
    expect(decode("m=-5").minMagnitude).toBe(MAG_MIN);
    expect(decode("m=99").minMagnitude).toBe(MAG_MAX);
  });

  it("carries a map zoomed out past the globe's floor", () => {
    /*
     * The map derives its own floor from the zoom at which the frame is 360 degrees wide: 0.64 at
     * desktop and 0.19 on a phone, both under the globe's 0.75. Clamping to 0.75 here made every fully
     * zoomed-out map view arrive up to four times tighter than it was shared.
     */
    for (const zoom of [0.19, 0.31, 0.64]) {
      expect(decode(encode({ ...state, zoom })).zoom).toBeCloseTo(zoom, 6);
    }
  });

  it("still refuses a zoom that is nonsense rather than merely small", () => {
    // The contextual limit belongs to `clampZoom`, which runs against a live viewport. This only has to
    // stop the camera ending up inside the planet or a million radii away.
    expect(decode("at=0,0,0").zoom).toBe(0.05);
    expect(decode("at=0,0,-4").zoom).toBe(0.05);
    expect(decode("at=0,0,1e9").zoom).toBe(3);
  });

  it("clamps latitude to the limit the camera actually has", () => {
    // This one was already right, and is asserted so it stays that way: LAT_LIMIT is 85.
    expect(decode("at=0,89,1").lat).toBe(85);
    expect(decode("at=0,-89,1").lat).toBe(-85);
  });
});

describe("an archived day in the link", () => {
  it("travels, so a link stops claiming live the moment the app does", () => {
    expect(encode({ ...state, day: "2026-07-04" })).toContain("d=2026-07-04");
    expect(encode({ ...state, day: null })).not.toContain("d=");
  });

  it("comes back out", () => {
    expect(decode("#at=1,2,1&d=2026-07-04").day).toBe("2026-07-04");
    expect(decode("#at=1,2,1").day).toBeUndefined();
  });

  it("refuses a date that only looks like one", () => {
    /*
     * `2026-02-31` matches the shape and is not a date; `Date.parse` would roll it into March and the
     * app would show a day nobody asked for.
     */
    expect(decode("#d=2026-02-31").day).toBeUndefined();
    expect(decode("#d=2026-13-01").day).toBeUndefined();
    expect(decode("#d=04-07-2026").day).toBeUndefined();
    expect(decode("#d=yesterday").day).toBeUndefined();
  });

  it("refuses a future day, because there is nothing to fetch", () => {
    const ahead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    expect(decode(`#d=${ahead}`).day).toBeUndefined();
  });

  it("survives a round trip beside a cursor, which is the other half of when", () => {
    const link = encode({ ...state, day: "2026-07-04", cursor: Date.parse("2026-07-04T09:30:00Z") });
    const back = decode(`#${link}`);
    expect(back.day).toBe("2026-07-04");
    expect(back.cursor).toBe(Date.parse("2026-07-04T09:30:00Z"));
  });
});

describe("a shared mark", () => {
  it("carries the kind and the agency's id", () => {
    const link = encode({ ...state, mark: "cyclone:1000234" });
    expect(link).toContain("k=cyclone:1000234");
    expect(decode(link).mark).toBe("cyclone:1000234");
  });

  it("survives ids that contain a colon, since the id half is not ours", () => {
    expect(decode("k=volcano:Etna:15.0,37.7").mark).toBe("volcano:Etna:15.0,37.7");
  });

  it("keeps every layer this app draws", () => {
    for (const kind of ["cyclone", "volcano", "fire", "flood"]) {
      expect(decode(`k=${kind}:7`).mark).toBe(`${kind}:7`);
    }
  });

  it("drops a kind this app does not draw, rather than passing it on to resolve to nothing", () => {
    expect(decode("k=asteroid:7").mark).toBeUndefined();
    expect(decode("k=cyclone").mark).toBeUndefined();
    expect(decode("k=cyclone:").mark).toBeUndefined();
    expect(decode("k=").mark).toBeUndefined();
  });

  it("leaves the key out entirely when nothing is selected", () => {
    expect(encode({ ...state, mark: null })).not.toContain("k=");
  });
});
