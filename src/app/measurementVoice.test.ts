import { afterEach, describe, expect, it, vi } from "vitest";
import { createMeasurementVoice, measurementHz } from "./measurementVoice";

afterEach(() => vi.unstubAllGlobals());

function audio() {
  vi.stubGlobal("document", { hidden: false });
  const oscillator = {
    frequency: { value: 0 },
    type: "",
    start: vi.fn(),
    stop: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    onended: null,
  };
  const gain = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  oscillator.connect.mockReturnValue(gain);
  const context = {
    currentTime: 0,
    state: "running",
    destination: {},
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const voice = createMeasurementVoice(function () {
    return context;
  } as unknown as typeof AudioContext);
  return { voice, context, oscillator, gain };
}

describe("measurement sonification", () => {
  it("maps rising measurements to rising pitch and clamps values to two octaves", () => {
    expect(measurementHz(-2, -2, 35)).toBe(220);
    expect(measurementHz(35, -2, 35)).toBe(880);
    expect(measurementHz(16.5, -2, 35)).toBe(440);
    expect(measurementHz(-100, -2, 35)).toBe(220);
    expect(measurementHz(100, -2, 35)).toBe(880);
    for (const [value, min, max] of [
      [NaN, 0, 1],
      [Infinity, 0, 1],
      [1, 0, Infinity],
      [1, 1, 1],
      [1, 2, 1],
    ])
      expect(measurementHz(value!, min!, max!)).toBeNull();
  });
  it("starts silently, limits rapid scrubbing, and releases its only voice", async () => {
    const { voice, context, oscillator, gain } = audio();
    await voice.ready;
    expect(context.createOscillator).not.toHaveBeenCalled();
    voice.play(1, 0, 2);
    voice.play(2, 0, 2);
    expect(context.createOscillator).toHaveBeenCalledTimes(1);
    expect(oscillator.frequency.value).toBe(440);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.035, 0.015);
    context.currentTime = 0.3;
    voice.play(2, 0, 2);
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
    expect(oscillator.disconnect).toHaveBeenCalledTimes(1);
    voice.close();
    voice.close();
    context.currentTime = 1;
    voice.play(1, 0, 2);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
  });
  it("never plays missing readings, a hidden document, or a suspended context", () => {
    const { voice, context } = audio();
    voice.play(NaN, 0, 2);
    vi.stubGlobal("document", { hidden: true });
    voice.play(1, 0, 2);
    vi.stubGlobal("document", { hidden: false });
    context.state = "suspended";
    voice.play(1, 0, 2);
    expect(context.createOscillator).not.toHaveBeenCalled();
    voice.close();
  });
});
