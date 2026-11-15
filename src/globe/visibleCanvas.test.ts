import { describe, expect, it, vi } from "vitest";
import { createCanvasClip, visiblePixels } from "./visibleCanvas";

describe("visible drawing area", () => {
  it("keeps every on-screen pixel at native canvas resolution", () => {
    expect(
      visiblePixels(
        { left: 460, top: 18, width: 1180, height: 1180 },
        { width: 1180, height: 1180 },
        { width: 1440, height: 900 },
      ),
    ).toEqual({ x: 0, y: 298, width: 980, height: 882 });
  });
  it("maps a transformed visible intersection back to drawing coordinates", () => {
    expect(
      visiblePixels(
        { left: -100, top: -50, width: 500, height: 400 },
        { width: 1000, height: 800 },
        { width: 320, height: 300 },
      ),
    ).toEqual({ x: 200, y: 100, width: 640, height: 600 });
  });
  it("skips a hidden or detached canvas", () => {
    expect(
      visiblePixels(
        { left: 500, top: 0, width: 100, height: 100 },
        { width: 100, height: 100 },
        { width: 320, height: 600 },
      ),
    ).toBeNull();
    expect(
      visiblePixels(
        { left: 0, top: 0, width: 0, height: 0 },
        { width: 100, height: 100 },
        { width: 320, height: 600 },
      ),
    ).toBeNull();
  });
  it("rounds outward so fractional CSS edges keep their antialiasing pixels", () => {
    expect(
      visiblePixels(
        { left: -0.5, top: 0, width: 100, height: 100 },
        { width: 100, height: 100 },
        { width: 99, height: 100 },
      ),
    ).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
  it("applies the native-pixel intersection to the renderer", () => {
    vi.stubGlobal("window", { innerWidth: 1440, innerHeight: 900 });
    try {
      const renderer = { setScissor: vi.fn(), setScissorTest: vi.fn() };
      const canvas = {
        closest: () => null,
        clientWidth: 1180,
        clientHeight: 1180,
        getBoundingClientRect: () => ({ left: 460, top: 18, width: 1180, height: 1180 }),
      } as unknown as HTMLCanvasElement;
      expect(createCanvasClip(renderer as never, canvas)()).toBe(true);
      expect(renderer.setScissorTest).toHaveBeenCalledWith(true);
      expect(renderer.setScissor).toHaveBeenCalledWith(0, 298, 980, 882);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("always draws the entire source for stills, video and layout motion", () => {
    const renderer = { setScissor: vi.fn(), setScissorTest: vi.fn() };
    const getAnimations = vi.fn(() => [] as { playState: string }[]);
    const canvas = {
      closest: () => ({ getAnimations }),
      getBoundingClientRect: vi.fn(() => {
        throw new Error("capture must not clip to viewport");
      }),
    } as unknown as HTMLCanvasElement;
    const apply = createCanvasClip(renderer as never, canvas);
    expect(apply(true)).toBe(true);
    getAnimations.mockReturnValue([{ playState: "running" }]);
    expect(apply()).toBe(true);
    expect(renderer.setScissorTest.mock.calls).toEqual([[false], [false]]);
    expect(renderer.setScissor).not.toHaveBeenCalled();
  });
});
