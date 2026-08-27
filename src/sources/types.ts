import type { Reading, SourceId } from "../data/types";

/*
 * What a source is, written before there are two of them.
 *
 * A contract written after the second source exists accidentally describes the first one. This interface has
 * to be satisfiable by a thing that asks every sixty seconds and by a thing that is told.
 *
 * The two transports differ in exactly one place, and it is not the data: it is who decides when.
 */

/** Milliseconds and a Response-shaped result, so tests never need a DOM. */
export interface FetchResult {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<FetchResult>;

/**
 * Everything a source touches that is not its own logic. Injected rather than reached for, because the
 * four-hour question and the backoff question are both about time, and a source that reads the clock itself
 * can only be tested by waiting.
 */
/** Whatever the host's `setTimeout` hands back. A number in a browser, an object in Node. */
export type TimerId = ReturnType<typeof setTimeout>;

export interface Runtime {
  fetch: Fetcher;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => TimerId;
  clearTimer: (id: TimerId) => void;
  /** Push transports only. Polling sources ignore it. */
  openSocket?: (url: string) => SocketLike;
}

export interface SocketLike {
  addEventListener: (type: string, fn: (event: { data?: unknown }) => void) => void;
  close: () => void;
}

export type SourceStatus =
  /** Not started, or stopped. */
  | { kind: "idle" }
  /** Data is flowing. `since` is when it started flowing, not when the source was created. */
  | { kind: "live"; since: number }
  /**
   * Reachable but unhappy. Carries what to say and when it will try again, because DESIGN.md
   * section 6 requires the rail to name the source and the retry rather than saying "error".
   */
  | { kind: "failing"; reason: string; retryAt: number };

export interface SourceHandlers {
  /** Called with new or revised readings only. Never with the same unchanged reading twice. */
  onReadings: (readings: Reading[]) => void;
  onStatus: (status: SourceStatus) => void;
  /**
   * Called once, by a source that has successfully fetched a backlog, with the timestamp it reaches back to.
   *
   * Never infer it from the first delivery carrying events. With both seed fetches dead and two stray socket
   * pushes arriving, the rail read "0 events, last 24 hours": a complete day it never asked for.
   */
  onSeeded: (from: number) => void;
}

export interface GeoEventSource {
  readonly id: SourceId;
  readonly transport: "poll" | "push";
  /** Idempotent. Starting an already-started source does nothing. */
  start: (handlers: SourceHandlers) => void;
  /** Idempotent, and total: after it returns, no handler will ever be called again. A source that leaves a
   * timer or a socket listener behind does not fail loudly - it fails as a second copy of the data arriving
   * after the user switched the source off. */
  stop: () => void;
}

/*
 * The real one. Bare `setTimeout`, never `window.setTimeout`: the live test runs this file under Node, where
 * the `window` form throws, and because scheduling happens inside the poll's try block the throw was caught
 * and reported as a feed failure.
 */
export const browserRuntime: Runtime = {
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (id) => clearTimeout(id),
  openSocket: (url) => new WebSocket(url),
};

/** Shared by every adapter, so backoff behaviour is one implementation rather than one per source. */
export function backoffMs(consecutiveFailures: number, baseMs: number, capMs: number): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, consecutiveFailures - 1));
}

export type { Reading, SourceId };
