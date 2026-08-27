import { describe, expect, it } from "vitest";
import pair from "./fixtures/one-quake-both-feeds.json";
import captured from "./fixtures/emsc-socket-frames.json";
import {
  createFakeRuntime, describeSourceContract, type FakeRuntime, type FakeSocket,
} from "./contract";
import { createEmscSource, parseEmscFrame, SEED_LIMIT } from "./emsc";
import { createUsgsSource } from "./usgs";
import { createStore } from "../data/store";
import { DISTANCE_LIMIT_KM, TIME_WINDOW_MS } from "../data/reconcile";
import { distanceKm } from "../geo/sphere";
import type { Reading } from "../data/types";

const FRAME = JSON.stringify(pair.emsc);

interface SocketRuntime extends FakeRuntime {
  sockets: FakeSocket[];
}

const makeRuntime = (mode: "healthy" | "broken"): SocketRuntime => {
  const sockets: FakeSocket[] = [];
  const runtime = createFakeRuntime({
    onSocket: (socket) => {
      sockets.push(socket);
      // Asynchronously, because the adapter attaches its listeners after openSocket returns and a
      // synchronous failure here would be shouted into an empty room.
      if (mode === "broken") queueMicrotask(() => socket.emit("error", {}));
    },
  }) as SocketRuntime;
  runtime.sockets = sockets;
  return runtime;
};

describeSourceContract({
  name: "EMSC",
  create: (runtime) => createEmscSource(runtime, "wss://example.invalid/socket"),
  runtime: makeRuntime,
  // A push source delivers by being told. The same frame every time, so repeated delivery is
  // also the deduplication test.
  deliver: async (runtime, mode) => {
    const socket = (runtime as SocketRuntime).sockets.at(-1);
    if (mode === "healthy" && socket && !socket.closed) {
      socket.emit("open", {});
      socket.emit("message", { data: FRAME });
    }
    await runtime.flush();
  },
  expectedFirstBatch: 1,
});

/*
 * The strongest evidence in the file.
 *
 * Every other EMSC fixture here is built from the REST catalogue, which publishes the same feature
 * but says nothing about the envelope the socket wraps it in. These frames were captured verbatim
 * off the live standing-order socket, so they are the only thing that can confirm the adapter
 * unwraps what the socket actually sends rather than what its documentation implies.
 */
describe("frames captured off the live socket", () => {
  it("parses every recorded frame into a usable reading", () => {
    expect(captured.frames.length).toBeGreaterThan(0);
    for (const frame of captured.frames) {
      const parsed = parseEmscFrame(JSON.stringify(frame), 1_700_000_000_000);
      expect(parsed).not.toBeNull();
      expect(parsed!.reading.source).toBe("emsc");
      expect(Number.isFinite(parsed!.reading.magnitude)).toBe(true);
      expect(parsed!.reading.time).toBeGreaterThan(1_600_000_000_000);
      expect(parsed!.reading.depthKm).toBeGreaterThan(0);
      expect(parsed!.reading.place).toBeTruthy();
      expect(parsed!.reading.kind).toBe("earthquake");
    }
  });

  it("keeps magnitude scales the recording contains that no other fixture does", () => {
    const scales = captured.frames.map(
      (f) => parseEmscFrame(JSON.stringify(f), 1)!.reading.scale,
    );
    // The live socket sent a bare "m", which is not a scale any hand-written fixture would have
    // thought to include, and is exactly why recordings are kept alongside invented edge cases.
    expect(scales).toContain("m");
    expect(scales.every((s) => s !== "unknown")).toBe(true);
  });
});

describe("parsing a real EMSC frame", () => {
  const at = 1_700_000_000_000;

  it("reads position from properties, not from the geometry", () => {
    const parsed = parseEmscFrame(FRAME, at);
    expect(parsed).not.toBeNull();
    const p = pair.emsc.data.properties;
    expect(parsed!.reading.lat).toBe(p.lat);
    expect(parsed!.reading.lon).toBe(p.lon);
    // The geometry's third coordinate is negative for a depth below the surface. Taking depth from
    // there instead of from properties puts every earthquake in the sky.
    expect(pair.emsc.data.geometry.coordinates[2]).toBeLessThanOrEqual(0);
    expect(parsed!.reading.depthKm).toBe(p.depth);
    expect(parsed!.reading.depthKm).toBeGreaterThan(0);
  });

  it("turns the ISO timestamp into epoch milliseconds", () => {
    const parsed = parseEmscFrame(FRAME, at)!;
    expect(parsed.reading.time).toBe(Date.parse(pair.emsc.data.properties.time));
    expect(parsed.reading.time).toBeGreaterThan(1_600_000_000_000);
  });

  it("spells out the event type code", () => {
    expect(parseEmscFrame(JSON.stringify({
      action: "create",
      data: { properties: { unid: "x", lat: 0, lon: 0, mag: 5, time: "2026-01-01T00:00:00Z",
        evtype: "se", magtype: "mb" } },
    }), at)!.reading.kind).toBe("suspected explosion");
  });

  it("passes an unrecognised type code through rather than calling it an earthquake", () => {
    expect(parseEmscFrame(JSON.stringify({
      action: "create",
      data: { properties: { unid: "x", lat: 0, lon: 0, mag: 5, time: "2026-01-01T00:00:00Z",
        evtype: "zz", magtype: "mb" } },
    }), at)!.reading.kind).toBe("zz");
  });

  it("returns null for frames that are not events, rather than throwing", () => {
    expect(parseEmscFrame("not json", at)).toBeNull();
    expect(parseEmscFrame(JSON.stringify({ action: "ping" }), at)).toBeNull();
    expect(parseEmscFrame(JSON.stringify({ action: "create", data: {} }), at)).toBeNull();
    expect(parseEmscFrame(JSON.stringify({ action: "create",
      data: { properties: { unid: "x", lat: 999, lon: 0, mag: 5, time: "2026-01-01T00:00:00Z" } },
    }), at)).toBeNull();
    expect(parseEmscFrame(null, at)).toBeNull();
  });
});

describe("push-specific behaviour", () => {
  it("bounds what it remembers, because a socket never restates itself", async () => {
    const runtime = makeRuntime("healthy");
    const source = createEmscSource(runtime, "wss://example.invalid/socket");
    let count = 0;
    source.start({ onReadings: (b) => { count += b.length; }, onStatus: () => {} , onSeeded: () => {} });
    const socket = runtime.sockets[0]!;
    socket.emit("open", {});

    // Far more distinct events than a page would ever see, to prove the seen-set is capped. A
    // polling source can replace its seen-set each cycle; a socket accumulates until told not to.
    for (let i = 0; i < 25_000; i += 1) {
      socket.emit("message", { data: JSON.stringify({
        action: "create",
        data: { properties: { unid: `e${i}`, lat: 10, lon: 20, mag: 4, magtype: "mb",
          time: "2026-01-01T00:00:00Z", lastupdate: "2026-01-01T00:00:01Z" } },
      }) });
    }
    await runtime.flush();
    expect(count).toBe(25_000);
    source.stop();
  });

  it("re-emits an event when EMSC revises it", async () => {
    const runtime = makeRuntime("healthy");
    const source = createEmscSource(runtime, "wss://example.invalid/socket");
    const mags: number[] = [];
    source.start({ onReadings: (b) => mags.push(...b.map((r) => r.magnitude)), onStatus: () => {} , onSeeded: () => {} });
    const socket = runtime.sockets[0]!;
    socket.emit("open", {});

    const frame = (mag: number, updated: string) => JSON.stringify({
      action: "create",
      data: { properties: { unid: "e1", lat: 10, lon: 20, mag, magtype: "mb",
        time: "2026-01-01T00:00:00Z", lastupdate: updated } },
    });

    socket.emit("message", { data: frame(4.2, "2026-01-01T00:00:10Z") });
    socket.emit("message", { data: frame(4.2, "2026-01-01T00:00:10Z") }); // identical resend
    socket.emit("message", { data: frame(4.6, "2026-01-01T00:05:00Z") }); // revised
    await runtime.flush();

    expect(mags).toEqual([4.2, 4.6]);
    source.stop();
  });

  it("does not treat its own teardown as a dropped connection", async () => {
    const runtime = makeRuntime("healthy");
    const source = createEmscSource(runtime, "wss://example.invalid/socket");
    const statuses: string[] = [];
    source.start({ onReadings: () => {}, onStatus: (s) => statuses.push(s.kind) , onSeeded: () => {} });
    runtime.sockets[0]!.emit("open", {});
    await runtime.flush();

    source.stop();
    // Closing a socket fires its close handler. Without the guard the source would announce
    // "connection lost" and schedule a reconnect for a session the user just ended.
    runtime.sockets[0]!.emit("close", {});
    await runtime.advance(5 * 60_000);

    expect(statuses).toEqual(["live"]);
    expect(runtime.pendingTimers()).toBe(0);
  });
});

/*
 * The gate for PLAN.md step 6.
 *
 * `one-quake-both-feeds.json` is one real earthquake, recorded from both agencies on the same day,
 * with nothing edited. It is the whole reason the $0 constraint produced a better project than a
 * paid second source would have: the two accounts disagree, and the app has to hold both.
 */
describe("one real earthquake, two agencies", () => {
  const drive = async () => {
    const store = createStore(100);
    const readings: Reading[] = [];

    const usgsRuntime = createFakeRuntime({
      respond: async () => ({ ok: true, status: 200, json: async () => pair.usgs }),
    });
    const usgs = createUsgsSource(usgsRuntime, "https://example.invalid/feed");
    usgs.start({ onReadings: (b) => readings.push(...b), onStatus: () => {} , onSeeded: () => {} });
    await usgsRuntime.flush();

    const emscRuntime = makeRuntime("healthy");
    const emsc = createEmscSource(emscRuntime, "wss://example.invalid/socket");
    emsc.start({ onReadings: (b) => readings.push(...b), onStatus: () => {} , onSeeded: () => {} });
    emscRuntime.sockets[0]!.emit("open", {});
    emscRuntime.sockets[0]!.emit("message", { data: FRAME });
    await emscRuntime.flush();

    for (const r of readings) store.ingest(r);
    return { store, readings, usgs, emsc, usgsRuntime, emscRuntime };
  };

  it("resolves to a single event carrying both readings", async () => {
    const { store, readings } = await drive();

    expect(readings).toHaveLength(2);
    expect(readings.map((r) => r.source).sort()).toEqual(["emsc", "usgs"]);
    expect(store.size()).toBe(1);

    const quake = store.latest(1)[0]!;
    expect(quake.readings).toHaveLength(2);
    // Neither reading is discarded, and the marker is drawn from the catalogue of record.
    expect(quake.primary.source).toBe("usgs");
  });

  it("keeps the disagreement the two agencies actually reported", async () => {
    const { store } = await drive();
    const quake = store.latest(1)[0]!;
    const [a, b] = quake.readings;

    const gapKm = distanceKm(a!.lon, a!.lat, b!.lon, b!.lat);
    const gapMs = Math.abs(a!.time - b!.time);

    // Recorded alongside the fixture when it was captured, so a data refresh cannot quietly
    // invalidate the thresholds these tests are really about.
    expect(gapKm).toBeLessThanOrEqual(pair._measured.epicentreDistanceKm + 0.5);
    expect(gapMs).toBe(pair._measured.originTimeDeltaMs);

    // And both are comfortably inside the windows, which is the evidence the windows are right.
    expect(gapMs).toBeLessThan(TIME_WINDOW_MS);
    expect(gapKm).toBeLessThan(DISTANCE_LIMIT_KM);
  });

  it("stops one source without disturbing the other", async () => {
    const { emsc, usgs, emscRuntime, usgsRuntime } = await drive();

    emsc.stop();
    expect(emscRuntime.openSockets()).toBe(0);
    expect(emscRuntime.pendingTimers()).toBe(0);
    // The poller is untouched: still scheduled, still its own timer.
    expect(usgsRuntime.pendingTimers()).toBe(1);

    usgs.stop();
    expect(usgsRuntime.pendingTimers()).toBe(0);
  });
});

/*
 * The coverage claim, which nothing checked.
 *
 * `onSeeded` is how the strip knows which hours the buffer was open for, and every test in this file
 * passed it an empty function. So the one branch that decides whether the app claims a month or
 * eighteen hours of it had no test at all, in a project whose whole argument is that it says what it
 * does not know.
 *
 * Sound for a measured reason rather than an assumed one: the portal's own ceiling is 20,000 rows,
 * thirty-three times `SEED_LIMIT`, so ours is always the binding limit and a short page is a short
 * catalogue. `emsc.live.test.ts` keeps that checked against the real endpoint.
 */
describe("how far back a seed says it reaches", () => {
  const HOUR = 3_600_000;

  /** A catalogue page of `count` events, newest first, one minute apart, as FDSN answers it. */
  const page = (count: number, now: number, opts: { parseable?: boolean } = {}) => ({
    features: Array.from({ length: count }, (_, i) => ({
      properties: opts.parseable === false
        ? { unid: `bad${i}` }
        : {
          unid: `e${i}`,
          lat: 10,
          lon: 20,
          mag: 4,
          magtype: "mb",
          time: new Date(now - i * 60_000).toISOString(),
          lastupdate: new Date(now - i * 60_000).toISOString(),
        },
    })),
  });

  /** Runs one seed against a catalogue response and hands back what it vouched for. */
  const seedWith = async (
    body: unknown, seedHours: number,
  ): Promise<{ covered: number | null; now: number }> => {
    const sockets: FakeSocket[] = [];
    const runtime = createFakeRuntime({
      onSocket: (socket) => sockets.push(socket),
      respond: async () => new Response(JSON.stringify(body), { status: 200 }),
    }) as SocketRuntime;
    runtime.sockets = sockets;
    const source = createEmscSource(
      runtime, { socket: "wss://example.invalid/socket", catalogue: "https://example.invalid/query" },
      seedHours,
    );
    let covered: number | null = null;
    source.start({
      onReadings: () => {},
      onStatus: () => {},
      onSeeded: (from) => { covered = from; },
    });
    await runtime.flush();
    await runtime.flush();
    source.stop();
    return { covered, now: runtime.now() };
  };

  it("vouches for the whole span when the page came back short of the limit", async () => {
    // 40 events over a month is a short catalogue, not a truncated page, because the limit is 600.
    const { covered, now } = await seedWith(page(40, 1_700_000_000_000), 30 * 24);
    expect(covered).toBe(now - 30 * 24 * HOUR);
  });

  it("vouches only as far as its oldest row when the page came back full", async () => {
    const at = 1_700_000_000_000;
    const { covered } = await seedWith(page(SEED_LIMIT, at), 30 * 24);
    // The oldest of 600 rows a minute apart, which is ten hours rather than the thirty days asked for.
    expect(covered).toBe(at - (SEED_LIMIT - 1) * 60_000);
    expect(covered).toBeGreaterThan(at - 30 * 24 * HOUR);
  });

  it("vouches for nothing when a full page yielded no events at all", async () => {
    /*
     * The one combination where falling back to the whole span is exactly wrong: the page was cut
     * short *and* there is no way to know where, so claiming the month is claiming it on zero
     * events. It used to do precisely that.
     */
    const { covered } = await seedWith(
      page(SEED_LIMIT, 1_700_000_000_000, { parseable: false }), 30 * 24,
    );
    expect(covered).toBeNull();
  });

  it("reads the edge off the page, not off what survived deduplication", async () => {
    /*
     * A socket push arriving before the seed lands removes that event from the delivered batch. If
     * the edge were read off the delivery, one duplicate at the old end of a truncated page would
     * move the coverage claim forwards in time and quietly over-claim.
     */
    const at = 1_700_000_000_000;
    const sockets: FakeSocket[] = [];
    const body = page(SEED_LIMIT, at);
    const runtime = createFakeRuntime({
      onSocket: (socket) => sockets.push(socket),
      respond: async () => new Response(JSON.stringify(body), { status: 200 }),
    }) as SocketRuntime;
    runtime.sockets = sockets;
    const source = createEmscSource(
      runtime, { socket: "wss://example.invalid/socket", catalogue: "https://example.invalid/query" },
      30 * 24,
    );
    let covered: number | null = null;
    source.start({
      onReadings: () => {},
      onStatus: () => {},
      onSeeded: (from) => { covered = from; },
    });
    // The oldest row on the page, pushed over the socket first, so the seed treats it as already seen.
    sockets[0]!.emit("open", {});
    sockets[0]!.emit("message", { data: JSON.stringify({
      action: "create", data: body.features[SEED_LIMIT - 1],
    }) });
    await runtime.flush();
    await runtime.flush();
    source.stop();
    expect(covered).toBe(at - (SEED_LIMIT - 1) * 60_000);
  });
});

describe("the authority behind an EMSC solution", () => {
  it("names who computed it, not who relayed it", () => {
    // BMKG is Indonesia's agency; EMSC passed their answer on. Both facts are now on screen.
    const nets = (captured.frames as { data: unknown }[])
      .map((f) => parseEmscFrame(JSON.stringify(f), 1_700_000_000_000)?.reading.network);
    expect(nets).toContain("BMKG");
    expect(nets.every((n) => n === undefined || n.trim() === n)).toBe(true);
  });

  it("is absent rather than blank", () => {
    const frame = {
      action: "create",
      data: {
        properties: {
          unid: "x", mag: 5, magtype: "mb", lat: 10, lon: 20, depth: 5,
          time: "2026-08-17T00:00:00Z", auth: "   ",
        },
        geometry: { coordinates: [20, 10, -5] },
      },
    };
    expect(parseEmscFrame(JSON.stringify(frame), 1)?.reading.network).toBeUndefined();
  });
});
