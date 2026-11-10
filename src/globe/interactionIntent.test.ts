import { describe, expect, it } from "vitest";
import { createRotationIdle } from "./rotationIdle";
import { createTapGesture } from "./tapGesture";
const pointer = (x = 0, id = 1) => ({ clientX: x, clientY: 0, pointerId: id });
describe("deliberate globe interactions", () => {
  it("waits for all fingers, momentum, and five idle seconds", () => {
    const idle = createRotationIdle();
    expect(idle.remaining(0)).toBe(0);
    idle.hold(1);
    idle.defer(10);
    idle.hold(2);
    expect(idle.remaining(10000)).toBe(Infinity);
    idle.release(1, 10000);
    expect(idle.remaining(15000)).toBe(Infinity);
    idle.release(2, 15000);
    idle.defer(16000);
    expect(idle.remaining(20999)).toBe(1);
    expect(idle.remaining(21000)).toBe(0);
    idle.hold(3);
    idle.clear(22000);
    expect(idle.remaining(27000)).toBe(0);
  });
  it("does not turn a drag returning to its origin into a click", () => {
    const tap = createTapGesture();
    tap.down(pointer());
    tap.move(pointer(30));
    tap.move(pointer());
    expect(tap.up(pointer())).toBe(false);
    tap.down(pointer());
    tap.move(pointer(2));
    expect(tap.up(pointer(2))).toBe(true);
  });
  it("rejects pinch and cancelled gestures while allowing the next click", () => {
    const tap = createTapGesture();
    tap.down(pointer());
    tap.down(pointer(10, 2));
    expect(tap.up(pointer(10, 2))).toBe(false);
    expect(tap.up(pointer())).toBe(false);
    tap.down(pointer());
    tap.cancel(pointer());
    expect(tap.up(pointer())).toBe(false);
    tap.down(pointer());
    expect(tap.up(pointer())).toBe(true);
  });
});
