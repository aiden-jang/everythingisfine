import { describe, expect, it } from "vitest";
import {
  createRingLayer, MAX_DEG, PLAYBACK, P_WAVE_KM_PER_S, RATE_DEG_PER_S, RING_LIFETIME_S,
  S_MAX_DEG, S_OVER_P, TRUE_RATE_DEG_PER_S,
} from "./rings";
import { S_WAVE_KM_PER_S } from "../geo/waves";
import { EARTH_RADIUS_KM } from "../geo/sphere";

/*
 * The rings are the one piece of motion in the product, and the claim attached to them is that
 * their speed is measured rather than invented. These tests exist to keep that claim true, because
 * it is the sort of thing that survives a refactor as a comment long after the number stopped
 * agreeing with it.
 */

describe("the rate is derived, not typed in", () => {
  it("advances at the P-wave velocity in real time", () => {
    // One second of real time covers 6km of ground, and 6km of a 6371km-radius sphere is this
    // many degrees. If someone changes either input, this fails rather than drifting.
    const expected = (P_WAVE_KM_PER_S / EARTH_RADIUS_KM) * (180 / Math.PI);
    expect(TRUE_RATE_DEG_PER_S).toBeCloseTo(expected, 10);
    expect(TRUE_RATE_DEG_PER_S).toBeCloseTo(0.05396, 4);
  });

  it("covers the ground the physics says over a known interval", () => {
    // Eighty seconds of a real P-wave is about 480km. That is the sentence DESIGN.md 3.3 makes,
    // and this is the assertion that keeps the sentence honest.
    const km = TRUE_RATE_DEG_PER_S * 80 * (Math.PI / 180) * EARTH_RADIUS_KM;
    expect(km).toBeCloseTo(480, 0);
  });

  it("plays back at exactly the multiplier the interface prints", () => {
    expect(RATE_DEG_PER_S).toBeCloseTo(TRUE_RATE_DEG_PER_S * PLAYBACK, 10);
    // The rail says "WAVEFRONT x20". If PLAYBACK moves and that label does not, the app is
    // quietly lying about a number, which section 10 forbids.
    expect(PLAYBACK).toBe(20);
  });

  it("gives a front a lifetime a person can actually watch", () => {
    // At true rate a 400px globe advances the front 0.16 pixels per second, which is why the
    // playback multiplier exists at all. Fifteen-ish seconds is long enough to notice and short
    // enough that fronts do not pile up.
    expect(RING_LIFETIME_S).toBeGreaterThan(10);
    expect(RING_LIFETIME_S).toBeLessThan(25);
    expect(RING_LIFETIME_S).toBeCloseTo(MAX_DEG / RATE_DEG_PER_S, 10);
  });
});

describe("the ring layer", () => {
  it("expires a front after its lifetime and not before", () => {
    const layer = createRingLayer();
    layer.spawn(140, 35, 5);
    expect(layer.active()).toBe(1);

    layer.step(RING_LIFETIME_S * 0.99);
    expect(layer.active()).toBe(1);
    layer.step(RING_LIFETIME_S * 0.02);
    expect(layer.active()).toBe(0);
    layer.dispose();
  });

  it("draws nothing at all once every front has gone", () => {
    const layer = createRingLayer();
    layer.spawn(0, 0, 5);
    layer.step(0.5);
    expect(layer.object.geometry.drawRange.count).toBeGreaterThan(0);

    layer.step(RING_LIFETIME_S);
    // Not merely faded to invisible: the draw range collapses, so an idle globe issues no
    // geometry for a layer with nothing in it.
    expect(layer.object.geometry.drawRange.count).toBe(0);
    layer.dispose();
  });

  it("keeps every vertex on the sphere, including at the poles", () => {
    const layer = createRingLayer();
    // The pole is the case a naive basis built from the north vector gets wrong: the cross product
    // collapses and the ring degenerates to a point or fills with NaN.
    for (const [lon, lat] of [[0, 90], [0, -90], [180, 0], [-179.9, 66.5], [0, 0]] as const) {
      layer.spawn(lon, lat, 6);
    }
    layer.step(3);

    const pos = layer.object.geometry.getAttribute("position");
    const count = layer.object.geometry.drawRange.count;
    expect(count).toBeGreaterThan(0);

    let min = Infinity;
    let max = 0;
    for (let i = 0; i < count; i += 1) {
      const r = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
      expect(Number.isFinite(r)).toBe(true);
      min = Math.min(min, r);
      max = Math.max(max, r);
    }
    // Every point sits on one shell just above the surface, whatever the epicentre was.
    expect(min).toBeCloseTo(1.007, 5);
    expect(max).toBeCloseTo(1.007, 5);
    layer.dispose();
  });

  it("puts the front the right angular distance from its epicentre", () => {
    const layer = createRingLayer();
    layer.spawn(0, 0, 5); // centre is +Z under the projection convention
    const seconds = 4;
    layer.step(seconds);

    const pos = layer.object.geometry.getAttribute("position");
    const expectedDeg = seconds * RATE_DEG_PER_S;
    // Angle between each vertex and the epicentre direction, which for lon 0 lat 0 is (0, 0, 1).
    for (let i = 0; i < 32; i += 1) {
      const z = pos.getZ(i) / 1.007;
      expect((Math.acos(Math.max(-1, Math.min(1, z))) * 180) / Math.PI).toBeCloseTo(expectedDeg, 4);
    }
    layer.dispose();
  });

  it("refuses to run more fronts than it has room for", () => {
    const layer = createRingLayer();
    for (let i = 0; i < 500; i += 1) layer.spawn(i % 360 - 180, 0, 4);
    // Dropped rather than allowed to overrun a fixed buffer. Global seismicity never approaches
    // this, and a burst that did would be a worse thing to crash on than to under-draw.
    expect(layer.active()).toBeLessThanOrEqual(64);
    layer.step(0.1);
    /*
     * Against the buffer it actually has, not against a restatement of how big that should be.
     *
     * This read `64 * 96 * 2`, which is the front count times the segments times two vertices, and it
     * quietly encoded "one circle per front" as well. Adding the S front made it fail while nothing
     * had overrun anything: the assertion had stopped describing the invariant and started describing
     * an implementation detail that changed.
     */
    const room = layer.object.geometry.getAttribute("position").count;
    expect(layer.object.geometry.drawRange.count).toBeLessThanOrEqual(room);
    layer.dispose();
  });

  it("fades a front out rather than cutting it", () => {
    const layer = createRingLayer();
    layer.spawn(0, 0, 5);
    layer.step(1);
    const early = layer.object.geometry.getAttribute("aFade").getX(0);
    layer.step(RING_LIFETIME_S * 0.7);
    const late = layer.object.geometry.getAttribute("aFade").getX(0);

    expect(early).toBeGreaterThan(late);
    expect(late).toBeGreaterThan(0);
    layer.dispose();
  });
});

describe("the S front, and the gap that measures distance", () => {
  it("derives both rates from velocities rather than restating them", () => {
    expect(S_OVER_P).toBeCloseTo(S_WAVE_KM_PER_S / P_WAVE_KM_PER_S, 12);
    // The ordinary crustal ratio, near the root three an elastic solid with Poisson 0.25 gives.
    expect(S_OVER_P).toBeCloseTo(0.5833, 4);
    expect(1 / S_OVER_P).toBeCloseTo(Math.sqrt(3), 1);
  });

  it("keeps the S front behind the P front at every moment of the life", () => {
    // Not merely at the end: an S front that ever led would be the arrival order inverted.
    for (const t of [0.01, 0.5, 0.25, 0.9, 0.99]) {
      const p = t * MAX_DEG;
      expect(p * S_OVER_P).toBeLessThan(p);
    }
  });

  it("opens a gap wide enough to read, which is the whole reason for it", () => {
    /*
     * The number that decided this was worth building, computed before it was. At the end of a front's
     * life the P ring is at 17 degrees and the S at 9.9, a gap of 7.1 degrees of arc. At the default
     * framing the globe projects to about 392px of radius, so a degree is 6.8px and the gap is some
     * 48px. The previous attempt at drawing the two agencies' disagreement failed at 4px, so this is
     * the check that says this one is a different proposition.
     */
    const gapDeg = MAX_DEG - MAX_DEG * S_OVER_P;
    expect(gapDeg).toBeCloseTo(7.083, 3);
    const pxPerDeg = (392 * Math.PI) / 180;
    expect(gapDeg * pxPerDeg).toBeGreaterThan(40);
  });

  it("ends both fronts together, so a lone ring is never left expanding", () => {
    // The S front is cut short on purpose: one event is one mark, and a circle outliving its partner
    // by eleven seconds reads as a new earthquake rather than as the tail of an old one.
    expect(S_MAX_DEG).toBeCloseTo(MAX_DEG * S_OVER_P, 12);
    expect(S_MAX_DEG).toBeLessThan(MAX_DEG);
  });

  it("draws two circles per front, and stays inside the buffer at the cap", () => {
    const layer = createRingLayer();
    layer.spawn(0, 0, 5);
    layer.step(0.1);
    const one = layer.object.geometry.drawRange.count;
    layer.spawn(40, 10, 5);
    layer.step(0.1);
    // Two fronts, four circles. The buffer was sized for the pair rather than for the ring, because
    // one sized for the ring silently draws half of them.
    expect(layer.object.geometry.drawRange.count).toBe(one * 2);
    layer.dispose();
  });
});
