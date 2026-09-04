import { describe, expect, it, vi } from "vitest";
import { TICK_MS, tick } from "./touch";

describe("the tap tick", () => {
  it("buzzes once, briefly", () => {
    const vibrate = vi.fn();
    tick({ vibrate } as unknown as Navigator);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(TICK_MS);
    // A buzz reads as a notification. This is meant to read as contact.
    expect(TICK_MS).toBeLessThan(25);
  });

  it("does nothing where the device cannot", () => {
    // Safari on iOS has no `vibrate` at all, which is the common case and must not throw.
    expect(() => tick({} as unknown as Navigator)).not.toThrow();
    expect(() => tick(undefined)).not.toThrow();
  });

  it("survives an engine that throws instead of refusing", () => {
    /*
     * Some engines reject `vibrate` outright when the document has never been interacted with. A picked
     * marker must not be able to take the panel down with it.
     */
    const vibrate = vi.fn(() => {
      throw new Error("not allowed");
    });
    expect(() => tick({ vibrate } as unknown as Navigator)).not.toThrow();
    expect(vibrate).toHaveBeenCalled();
  });
});
