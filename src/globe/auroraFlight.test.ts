import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { createAuroraFlight } from "./auroraFlight";

describe("aurora flight framing", () => {
  it("banks toward the oval, sweeps the veil, and settles back to the geographic camera", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 3.2);
    const before = camera.position.clone();
    const flight = createAuroraFlight(camera);
    flight.set(1);
    expect(flight.sweep()).toBe(0);
    expect(flight.step(1.2, false)).toBe(true);
    flight.apply();
    expect(camera.position.length()).toBeLessThan(before.length());
    expect(flight.sweep()).toBeGreaterThan(0);
    expect(flight.sweep()).toBeLessThan(1);
    expect(flight.step(3, false)).toBe(false);
    camera.position.copy(before);
    flight.apply();
    expect(camera.position.equals(before)).toBe(true);
    expect(flight.sweep()).toBe(1);
  });

  it("settles an interrupted southern shot and shows the whole veil immediately under reduced motion", () => {
    const flight = createAuroraFlight(new PerspectiveCamera());
    flight.set(-1);
    flight.step(1.1, false);
    flight.interrupt();
    expect(flight.sweep()).toBe(1);
    expect(flight.step(0.01, false)).toBe(true);
    expect(flight.step(0.5, false)).toBe(false);
    flight.set(-1);
    expect(flight.step(0, true)).toBe(false);
    expect(flight.ready()).toBe(true);
    expect(flight.sweep()).toBe(1);
    flight.set(null);
    expect(flight.sweep()).toBe(0);
  });
});
