import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recordClip } from "./clipRecorder";
import { drawStill } from "../still";
vi.mock("../still", () => ({ drawStill: vi.fn(), STILL_WIDTH: 1200, STILL_HEIGHT: 1200 }));
const stopTrack = vi.fn();
class Recorder {
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType = "video/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["recorded frames"]) });
    this.onstop?.();
  }
}
const canvas = {
  width: 720,
  height: 720,
  captureStream: () => ({ getTracks: () => [{ stop: stopTrack }] }),
  getContext: () => ({
    scale: vi.fn(),
    save: vi.fn(),
    resetTransform: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn(),
  }),
} as unknown as HTMLCanvasElement;
const options = () => ({
  source: canvas,
  caption: () => ({ moment: "Apollo 17, 1972", verdict: null, filter: "NASA", host: "example.test" }),
  theme: { background: "#111", ink: "#eee", faint: "#aaa", ramp: "thermal" as const },
  complete: vi.fn(),
  failed: vi.fn(),
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", { createElement: () => canvas });
  vi.stubGlobal("MediaRecorder", Recorder);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("records at a fixed output size and finishes at ten seconds with tracks and timers released", () => {
  const hooks = options();
  recordClip(hooks);
  expect(drawStill).toHaveBeenCalledWith(
    expect.anything(),
    canvas,
    720,
    720,
    expect.objectContaining({ moment: "Apollo 17, 1972", filter: "NASA" }),
    hooks.theme,
  );
  vi.advanceTimersByTime(10_000);
  expect(hooks.complete).toHaveBeenCalledWith(expect.objectContaining({ type: "video/webm", size: 15 }));
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("cancelling discards bytes, stops tracks and never delivers a file", () => {
  const hooks = options();
  const clip = recordClip(hooks);
  clip.cancel();
  clip.cancel();
  vi.advanceTimersByTime(11_000);
  expect(hooks.complete).not.toHaveBeenCalled();
  expect(hooks.failed).not.toHaveBeenCalled();
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("cancelling a pending stop invalidates its late encoded result", () => {
  const original = Recorder.prototype.stop;
  Recorder.prototype.stop = function () {
    this.state = "inactive";
    setTimeout(() => {
      this.ondataavailable?.({ data: new Blob(["late frames"]) });
      this.onstop?.();
    }, 0);
  };
  try {
    const hooks = options();
    const clip = recordClip(hooks);
    clip.stop();
    clip.cancel();
    vi.runAllTimers();
    expect(hooks.complete).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    Recorder.prototype.stop = original;
  }
});
