import { afterEach, describe, expect, it, vi } from "vitest";
import { restorePanel } from "./panelReturn";

afterEach(() => vi.unstubAllGlobals());
describe("return to a reading panel", () => {
  it("restores scroll without moving the world and skips a hidden trigger", () => {
    const panel = { getClientRects: () => [1], scrollTo: vi.fn(), focus: vi.fn(), hasAttribute: () => false };
    const trigger = { ...panel, getClientRects: () => [], focus: vi.fn() };
    const fallback = { ...panel, focus: vi.fn() };
    const nodes: Record<string, typeof panel> = { panel, trigger, fallback };
    vi.stubGlobal("document", { getElementById: (id: string) => nodes[id] });
    restorePanel({ scrollTarget: "panel", scroll: 318, focus: "trigger", fallback: "fallback" });
    expect(panel.scrollTo).toHaveBeenCalledWith(0, 318);
    expect(trigger.focus).not.toHaveBeenCalled();
    expect(fallback.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it("does not steal focus after the destination disappears", () => {
    const focus = vi.fn();
    vi.stubGlobal("document", { getElementById: () => ({ getClientRects: () => [], focus }) });
    restorePanel({ scrollTarget: "old-panel", scroll: 10, focus: "old-trigger" });
    expect(focus).not.toHaveBeenCalled();
  });
});
