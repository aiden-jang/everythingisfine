import { describe, expect, it, vi } from "vitest";
import recorded from "./fixtures/usgs-all-hour.json";
import pair from "./fixtures/one-quake-both-feeds.json";
import { createFakeRuntime, type FakeSocket } from "./contract";
import { createEmscSource } from "./emsc";
import { createUsgsSource } from "./usgs";
import type { Runtime, SourceHandlers } from "./types";

const handlers = (): SourceHandlers => ({ onReadings: vi.fn(), onStatus: vi.fn(), onSeeded: vi.fn() });

describe("source lifetime recovery", () => {
  it("EMSC respects an explicitly disabled catalogue seed", async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ features: [] }) }));
    const runtime = createFakeRuntime({ respond: fetch });
    const source = createEmscSource(runtime, { catalogue: null });
    source.start(handlers());
    await runtime.flush();
    expect(fetch).not.toHaveBeenCalled();
    source.stop();
  });

  for (const kind of ["usgs", "emsc"] as const) {
    it(`${kind} ignores an older request after stop and restart`, async () => {
      let release!: () => void;
      let calls = 0;
      const first = new Promise<void>((resolve) => {
        release = resolve;
      });
      const runtime = createFakeRuntime({
        respond: async () => {
          if (++calls === 1) await first;
          else await new Promise(() => {});
          return {
            ok: true,
            status: 200,
            json: async () => (kind === "usgs" ? recorded : { features: [pair.emsc.data] }),
          };
        },
      });
      const source = kind === "usgs" ? createUsgsSource(runtime) : createEmscSource(runtime);
      const previous = handlers();
      const current = handlers();
      source.start(previous);
      source.stop();
      source.start(current);
      release();
      await runtime.flush();
      expect(previous.onReadings).not.toHaveBeenCalled();
      expect(current.onReadings).not.toHaveBeenCalled();
      expect(current.onSeeded).not.toHaveBeenCalled();
      expect(current.onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "live" }));
      source.stop();
      expect(runtime.pendingTimers()).toBe(0);
    });
  }

  it("EMSC retries a constructor refusal without crashing startup", async () => {
    const runtime = createFakeRuntime();
    const open = runtime.openSocket!;
    let refused = true;
    runtime.openSocket = (url) => {
      if (refused) throw new DOMException("Blocked", "SecurityError");
      return open(url);
    };
    const source = createEmscSource(runtime, "wss://example.invalid/socket");
    const events = handlers();
    expect(() => source.start(events)).not.toThrow();
    expect(events.onStatus).toHaveBeenCalledWith(expect.objectContaining({ kind: "failing" }));
    refused = false;
    await runtime.advance(2_000);
    expect(runtime.openSockets()).toBe(1);
    source.stop();
    expect(runtime.openSockets()).toBe(0);
    expect(runtime.pendingTimers()).toBe(0);
  });

  it("EMSC closes a failed socket before reconnecting", async () => {
    let socket!: FakeSocket;
    const runtime = createFakeRuntime({
      onSocket: (next) => {
        socket = next;
      },
    });
    const source = createEmscSource(runtime, "wss://example.invalid/socket");
    source.start(handlers());
    socket.emit("error", {});
    expect(socket.closed).toBe(true);
    expect(runtime.pendingTimers()).toBe(1);
    await runtime.advance(2_000);
    expect(runtime.openSockets()).toBe(1);
    source.stop();
    expect(runtime.openSockets()).toBe(0);
  });

  it("EMSC cleanup survives a close refusal", () => {
    const runtime: Runtime = createFakeRuntime();
    const open = runtime.openSocket!;
    runtime.openSocket = (url) => ({
      ...open(url),
      close: () => {
        throw new Error("Closed");
      },
    });
    const source = createEmscSource(runtime, "wss://example.invalid/socket");
    source.start(handlers());
    expect(() => source.stop()).not.toThrow();
  });
});
