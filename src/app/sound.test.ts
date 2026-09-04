import { describe, expect, it, vi } from "vitest";
import { chooseVoices, createSiren, MAX_VOICES, toneGain, toneHz, toneSeconds } from "./sound";
import { MAG_MAX, MAG_MIN } from "../globe/ramp";

describe("pitch falls as magnitude rises", () => {
  it("goes down, which is the direction a real rupture goes", () => {
    // A larger rupture radiates a lower corner frequency. Getting this backwards would be a choice
    // that sounds fine and means the opposite of the physics.
    expect(toneHz(7)).toBeLessThan(toneHz(3));
    expect(toneHz(MAG_MAX)).toBeLessThan(toneHz(MAG_MIN));
  });

  it("spans two octaves across the whole scale", () => {
    expect(toneHz(MAG_MIN)).toBeCloseTo(440, 6);
    expect(toneHz(MAG_MAX)).toBeCloseTo(110, 6);
  });

  it("is geometric, so the middle of the scale is the middle of the pitch", () => {
    /*
     * Linear interpolation of frequency would put the midpoint at 275 Hz, spending most of the audible
     * range on the top half of the magnitude scale where almost no events are. Geometric puts it at 220,
     * one octave down, which is what a listener hears as halfway.
     */
    const mid = (MAG_MIN + MAG_MAX) / 2;
    expect(toneHz(mid)).toBeCloseTo(220, 0);
  });

  it("clamps beyond the ends of the ramp rather than running out of the audible range", () => {
    expect(toneHz(-5)).toBeCloseTo(toneHz(MAG_MIN), 6);
    expect(toneHz(12)).toBeCloseTo(toneHz(MAG_MAX), 6);
  });
});

describe("the other two channels", () => {
  it("lasts longer for a bigger event", () => {
    expect(toneSeconds(7)).toBeGreaterThan(toneSeconds(3));
    expect(toneSeconds(MAG_MIN)).toBeCloseTo(0.18, 6);
    expect(toneSeconds(MAG_MAX)).toBeCloseTo(0.9, 6);
  });

  it("compresses loudness far below the energy it stands for", () => {
    /*
     * Three points of magnitude is 31,623 times the energy. If gain tracked that, one event would be
     * inaudible and the next would be damaging, so this ratio is deliberately tiny and the legend says
     * loudness is not energy.
     */
    const ratio = toneGain(7) / toneGain(4);
    expect(ratio).toBeLessThan(4);
    expect(toneGain(MAG_MIN)).toBeGreaterThan(0);
    expect(toneGain(MAG_MAX)).toBeLessThan(0.3);
  });
});

describe("how many play at once", () => {
  it("keeps the loudest and drops the rest, so a swarm is not a chord", () => {
    expect(chooseVoices([2.1, 5.8, 3.3, 4.9, 2.2])).toEqual([5.8, 4.9, 3.3]);
  });

  it("plays everything when there is room", () => {
    expect(chooseVoices([3, 4])).toEqual([4, 3]);
    expect(chooseVoices([])).toEqual([]);
  });

  it("caps at three", () => {
    expect(MAX_VOICES).toBe(3);
    expect(chooseVoices([1, 2, 3, 4, 5, 6, 7])).toHaveLength(3);
  });
});

describe("the siren itself", () => {
  const fakeCtx = () => {
    const osc = {
      type: "",
      frequency: { value: 0 },
      connect: vi.fn(() => gain),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain: Record<string, unknown> = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    const ctx = {
      state: "running",
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => osc),
      createGain: vi.fn(() => gain),
      resume: vi.fn(),
      close: vi.fn(),
    };
    return {
      ctx,
      osc,
      gain,
      Ctx: function () {
        return ctx;
      } as unknown as typeof AudioContext,
    };
  };

  it("makes one oscillator per voice", () => {
    const { ctx, Ctx } = fakeCtx();
    createSiren(Ctx).play([4.2, 3.1]);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it("plays nothing at all when there is nothing to play", () => {
    const { ctx, Ctx } = fakeCtx();
    createSiren(Ctx).play([]);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  it("stays silent while the tab is hidden", () => {
    // Stubbed rather than spied: this suite runs in node, where `document` does not exist at all -
    // which is also why `createSiren` guards on `typeof document` instead of reading it directly.
    const { ctx, Ctx } = fakeCtx();
    vi.stubGlobal("document", { hidden: true });
    createSiren(Ctx).play([6.4]);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("plays when the tab is visible", () => {
    const { ctx, Ctx } = fakeCtx();
    vi.stubGlobal("document", { hidden: false });
    createSiren(Ctx).play([6.4]);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("resumes a context the browser suspended, or every later sound is dropped silently", () => {
    const { ctx, Ctx } = fakeCtx();
    ctx.state = "suspended";
    createSiren(Ctx).play([4]);
    expect(ctx.resume).toHaveBeenCalled();
  });
});
