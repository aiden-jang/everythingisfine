import { describe, expect, it } from "vitest";
import type { Reading } from "../data/types";
import type { FetchResult, GeoEventSource, Runtime, SocketLike, SourceStatus } from "./types";

/* The suite every source must pass, written while there is only one source. See ARCHITECTURE.md#srcsourcescontractts. */

/** A clock and network the test drives by hand. Shared so both adapters are exercised identically. */
export interface FakeRuntime extends Runtime {
  /** Run every timer due at or before `now + ms`, advancing the clock as it goes. */
  advance: (ms: number) => Promise<void>;
  /** Let queued promise callbacks run without moving the clock. */
  flush: () => Promise<void>;
  /** Timers still outstanding. Non-zero after stop() means a leak. */
  pendingTimers: () => number;
  /** Sockets opened and not closed. Non-zero after stop() means a leak. */
  openSockets: () => number;
}

export interface FakeRuntimeOptions {
  /** Answers a fetch. Throwing or returning `ok: false` is how a test breaks the transport. */
  respond?: (url: string) => FetchResult | Promise<FetchResult>;
  /** Sockets handed out, so a test can push messages into them. */
  onSocket?: (socket: FakeSocket) => void;
}

export interface FakeSocket extends SocketLike {
  emit: (type: string, event: { data?: unknown }) => void;
  closed: boolean;
}

export function createFakeRuntime(opts: FakeRuntimeOptions = {}): FakeRuntime {
  let now = 1_700_000_000_000;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const sockets: FakeSocket[] = [];

  const flush = async (): Promise<void> => {
    // Four turns of the microtask queue. A poll is fetch, then json, then emit, then schedule, and
    // one await is not enough to see the end of that chain.
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  };

  return {
    now: () => now,
    fetch: async (url) => {
      if (!opts.respond) throw new Error("no responder configured");
      return opts.respond(url);
    },
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id);
    },
    openSocket: (url) => {
      const listeners = new Map<string, ((e: { data?: unknown }) => void)[]>();
      const socket: FakeSocket = {
        closed: false,
        addEventListener: (type, fn) => {
          listeners.set(type, [...(listeners.get(type) ?? []), fn]);
        },
        close: () => {
          socket.closed = true;
        },
        emit: (type, event) => {
          for (const fn of listeners.get(type) ?? []) fn(event);
        },
      };
      sockets.push(socket);
      opts.onSocket?.(socket);
      void url;
      return socket;
    },
    advance: async (ms) => {
      const until = now + ms;
      // One timer at a time, re-reading the map, because firing a timer schedules the next one.
      for (;;) {
        let soonest: { id: number; at: number; fn: () => void } | null = null;
        for (const [id, t] of timers) {
          if (t.at <= until && (!soonest || t.at < soonest.at)) soonest = { id, ...t };
        }
        if (!soonest) break;
        timers.delete(soonest.id);
        now = soonest.at;
        soonest.fn();
        await flush();
      }
      now = until;
      await flush();
    },
    flush,
    pendingTimers: () => timers.size,
    openSockets: () => sockets.filter((s) => !s.closed).length,
  };
}

export interface ContractSubject {
  name: string;
  /** Builds the source against the fake runtime the suite controls. */
  create: (runtime: FakeRuntime) => GeoEventSource;
  /** A runtime wired to deliver real-shaped data on demand. */
  runtime: (mode: "healthy" | "broken") => FakeRuntime;
  /**
   * Makes the transport hand over one payload and waits until the source has processed it. See
   * ARCHITECTURE.md.
   */
  deliver: (runtime: FakeRuntime, mode: "healthy" | "broken") => Promise<void>;
  /** How many readings a healthy `deliver` is expected to produce the first time. */
  expectedFirstBatch: number;
}

export function describeSourceContract(subject: ContractSubject): void {
  describe(`${subject.name} satisfies the source contract`, () => {
    // Statuses are stamped with the time they arrived. A status carries `retryAt`, an absolute moment, and
    // the thing under test is the gap between the failure and the retry: subtracting the clock's current
    // value gets that wrong the instant the clock moves.
    const collect = (source: GeoEventSource, runtime: FakeRuntime) => {
      const readings: Reading[] = [];
      const statuses: { status: SourceStatus; at: number }[] = [];
      source.start({
        onReadings: (batch) => readings.push(...batch),
        onStatus: (status) => statuses.push({ status, at: runtime.now() }),
        onSeeded: () => {},
      });
      return { readings, statuses, kinds: () => statuses.map((s) => s.status.kind) };
    };

    it("emits readings that are all structurally sound", async () => {
      const runtime = subject.runtime("healthy");
      const source = subject.create(runtime);
      const { readings } = collect(source, runtime);
      await subject.deliver(runtime, "healthy");

      expect(readings.length).toBe(subject.expectedFirstBatch);
      for (const r of readings) {
        expect(r.source).toBe(source.id);
        expect(r.id).toBeTruthy();
        expect(Number.isFinite(r.magnitude)).toBe(true);
        expect(r.scale).toBeTruthy();
        expect(r.lat).toBeGreaterThanOrEqual(-90);
        expect(r.lat).toBeLessThanOrEqual(90);
        expect(r.lon).toBeGreaterThanOrEqual(-180);
        expect(r.lon).toBeLessThanOrEqual(180);
        expect(r.time).toBeGreaterThan(0);
        expect(r.place).toBeTruthy();
        expect(r.kind).toBeTruthy();
        expect(r.receivedAt).toBeGreaterThan(0);
      }
      source.stop();
    });

    it("reports live once data is flowing", async () => {
      const runtime = subject.runtime("healthy");
      const source = subject.create(runtime);
      const { statuses } = collect(source, runtime);
      await subject.deliver(runtime, "healthy");

      expect(statuses.at(-1)?.status.kind).toBe("live");
      source.stop();
    });

    it("never announces the same unchanged reading twice", async () => {
      const runtime = subject.runtime("healthy");
      const source = subject.create(runtime);
      const { readings } = collect(source, runtime);

      await subject.deliver(runtime, "healthy");
      const first = readings.length;
      await subject.deliver(runtime, "healthy");
      await subject.deliver(runtime, "healthy");

      expect(readings.length).toBe(first);
      source.stop();
    });

    it("degrades instead of throwing when the transport fails", async () => {
      const runtime = subject.runtime("broken");
      const source = subject.create(runtime);
      const { statuses, readings } = collect(source, runtime);
      await subject.deliver(runtime, "broken");

      const last = statuses.at(-1)?.status;
      expect(last?.kind).toBe("failing");
      if (last?.kind === "failing") {
        // Named, and with a time attached: the rail has to say which source and when it retries.
        expect(last.reason).toBeTruthy();
        expect(last.retryAt).toBeGreaterThan(runtime.now());
      }
      expect(readings).toHaveLength(0);
      source.stop();
    });

    it("keeps trying after a failure, with a longer wait each time", async () => {
      const runtime = subject.runtime("broken");
      const source = subject.create(runtime);
      const { statuses } = collect(source, runtime);
      await subject.deliver(runtime, "broken");

      for (let i = 0; i < 3; i += 1) await runtime.advance(10 * 60_000);

      // Each wait is measured against the moment its own status was emitted, not against a clock
      // that has since moved on.
      const waits = statuses
        .filter((s) => s.status.kind === "failing")
        .map((s) => (s.status as { retryAt: number }).retryAt - s.at);

      expect(waits.length).toBeGreaterThan(1);
      expect(waits.at(-1)!).toBeGreaterThan(waits[0]!);
      source.stop();
    });

    // A leaked timer or socket does not throw. It shows up as the feed arriving twice as fast, or as events
    // appearing after the user switched the source off.
    it("goes completely quiet after stop, and leaves nothing behind", async () => {
      const runtime = subject.runtime("healthy");
      const source = subject.create(runtime);
      const { readings, statuses } = collect(source, runtime);
      await subject.deliver(runtime, "healthy");

      source.stop();
      const readingsAtStop = readings.length;
      const statusesAtStop = statuses.length;

      /*
       * Checked before the clock moves, and that ordering is the whole test. Asserted after advancing, a
       * sabotaged `stop` that left its timer behind still passed: the stray timer fired during the advance,
       * removed itself, and found `handlers` already null. The leak was real and every symptom was masked.
       */
      expect(runtime.pendingTimers()).toBe(0);
      expect(runtime.openSockets()).toBe(0);

      await runtime.advance(30 * 60_000);
      await subject.deliver(runtime, "healthy").catch(() => undefined);

      expect(readings).toHaveLength(readingsAtStop);
      expect(statuses).toHaveLength(statusesAtStop);
    });

    it("survives stop being called twice, and start after stop", async () => {
      const runtime = subject.runtime("healthy");
      const source = subject.create(runtime);
      collect(source, runtime);
      await subject.deliver(runtime, "healthy");

      source.stop();
      expect(() => source.stop()).not.toThrow();

      const second = collect(source, runtime);
      await subject.deliver(runtime, "healthy");
      expect(second.readings.length).toBe(subject.expectedFirstBatch);
      source.stop();
      expect(runtime.pendingTimers()).toBe(0);
    });
  });
}
