import { Raycaster, Vector2, Vector3, type PerspectiveCamera } from "three";
import { RADIUS_ATMOSPHERE } from "../geo/land";
import { DEG } from "../geo/sphere";

/*
 * Orbiting the globe.
 *
 * Hand-written rather than OrbitControls, for one reason that matters and one that follows from it.
 * DESIGN.md asks for zoom anchored to the cursor, and on a sphere that is a different problem from
 * the one OrbitControls solves: there is no pan target to slide, only a rotation that has to put the
 * same piece of coastline back under the pointer at the new magnification. Once that is being
 * written by hand the rest is a hundred lines, and it avoids pulling examples/jsm in for a
 * behaviour that then has to be fought.
 *
 * The camera is described in geographic terms, not Cartesian ones: it sits above some longitude and
 * latitude at some distance. Every interaction in this file is then expressible in the same units
 * as the data, which is what makes cursor anchoring a subtraction rather than a matrix problem.
 */

/** Beyond this the up vector flips and the globe rolls over. */
const LAT_LIMIT = 85;

/*
 * Zoom is magnification: 1 is the framing shot, 2 is twice as close, and distance is fit/zoom.
 *
 * It was first written as a multiple of the distance, which is the same information and reads
 * backwards at every single use site. The wheel handler duly zoomed out when scrolled up, and the
 * bug was invisible in the code because `zoom * 1.5` looks exactly like zooming in. Naming the
 * quantity after what the user perceives, rather than after what the camera stores, removes the
 * entire class of mistake.
 *
 * The clamps stop the globe being entered or lost: 3 puts the camera about a third of a radius off
 * the surface, and 0.75 keeps it filling enough of the frame to still be the subject.
 */
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 3;

/** Flick decay. A third of a second of coasting reads as weight; longer reads as ice. */
const MOMENTUM_TAU = 0.32;
const MOMENTUM_FLOOR = 0.6; // deg/sec, below which it has stopped
/**
 * Ceiling on a flick, in deg/sec. Coast distance is velocity times MOMENTUM_TAU, so an unclamped
 * hard flick measured 131 degrees: a third of the planet from one gesture, which overshoots any
 * intent. At 200 the hardest possible throw coasts about 64 degrees and still feels thrown.
 */
const MOMENTUM_MAX = 200;

/**
 * How far back the entrance starts, in degrees of longitude.
 *
 * One arrival, then nothing. The source doc asks for the globe to rotate into its framing position
 * and stop, and the value of that is entirely in the stopping: a camera that settles says the
 * motion afterwards belongs to the data. Forty-two degrees is about a second of critically damped
 * travel, which is long enough to read as arriving and short enough not to be a title sequence.
 */
const ENTRANCE_DEG = 42;
const ENTRANCE_ZOOM = 0.88;

/** DESIGN.md section 8. Damping 20 against stiffness 100 is exactly critical: no overshoot. */
const SPRING_STIFFNESS = 100;
const SPRING_DAMPING = 20;

export interface Framing {
  lon: number;
  lat: number;
}

export interface CameraState {
  lon: number;
  lat: number;
  zoom: number;
}

export interface Controls {
  /** Wires up pointer, wheel and keyboard listeners. Returns the detach function. */
  attach: (onChange: () => void) => () => void;
  /** Advances momentum and any reset spring. Returns true while something is still moving. */
  step: (dt: number) => boolean;
  /** Writes the current orientation onto the camera. */
  apply: () => void;
  /** The framing distance, recomputed on resize. Zoom is expressed relative to it. */
  setFit: (distance: number) => void;
  /** Geographic point under a client pixel, or null off the globe. Hover in step 9 needs this. */
  pick: (clientX: number, clientY: number) => { lon: number; lat: number } | null;
  /** The whole camera in three numbers. This is exactly what a permalink has to carry. */
  state: () => CameraState;
  /** Springs the camera to a place. Instant under reduced motion, per DESIGN.md section 8. */
  flyTo: (lon: number, lat: number, zoom?: number) => void;
  /** The one entrance. Does nothing at all under reduced motion, which is the correct nothing. */
  enter: () => void;
  /** Screen position of a geographic point, or null when it is round the back. */
  project: (lon: number, lat: number) => { x: number; y: number } | null;
}

export function createControls(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  framing: Framing,
  fovDeg: number,
): Controls {
  let lon = framing.lon;
  let lat = framing.lat;
  let zoom = 1;
  let fit = 4;

  let vLon = 0;
  let vLat = 0;
  let vZoom = 0;
  /*
   * Where the camera is being pulled, or null when nothing is pulling it.
   *
   * Double-click reset and "fly to this region" are the same motion with different destinations,
   * so they are one mechanism. Writing the reset as a special case first and then bolting on a
   * second spring for regions would have given the two an inconsistent feel for no reason.
   */
  let target: { lon: number; lat: number; zoom: number } | null = null;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointers = new Map<number, { x: number; y: number }>();
  let lastMove = { x: 0, y: 0, t: 0 };
  let pinchDist = 0;

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const hit = new Vector3();
  const world = new Vector3();

  /**
   * Distance, with a hard floor that does not depend on the zoom clamp being set correctly.
   *
   * At ZOOM_MAX the camera currently stops 0.19 radii outside the atmosphere shell, which is fine
   * and is also luck: it falls out of the framing fraction, the field of view and the zoom ceiling
   * agreeing, and any one of those moving on its own would put the camera inside the shell and wash
   * the screen. The floor states the actual requirement in one place instead.
   */
  const DIST_FLOOR = RADIUS_ATMOSPHERE + 0.12;
  const dist = (): number => Math.max(DIST_FLOOR, fit / zoom);

  /**
   * Pixels per unit of projected height at the origin plane. The one constant the projection needs.
   */
  const focalPx = (): number => canvas.clientHeight / (2 * Math.tan((fovDeg / 2) * DEG));

  /*
   * How far around the globe a pixel offset from centre actually is.
   *
   * This took three attempts and both wrong ones looked reasonable in code.
   *
   * Dividing pixels by the globe's on-screen radius treats the sphere as flat, which under-rotates
   * badly. Inverting a sine, `asin(px / R)`, treats it as an *orthographic* sphere, which is the
   * projection a sphere has only when viewed from infinity. This camera is 4.5 radii away, and the
   * difference between those two cases is a factor of d/(d-1), about 29% here: enough that the
   * coastline visibly slides out from under the pointer during a drag.
   *
   * The real relationship, for a point `sigma` around from the sub-camera point, is
   *
   *     px = focal * sin(sigma) / (d - cos(sigma))
   *
   * which inverts in closed form. Writing `u = px / focal` and collecting the sine and cosine into
   * one phase-shifted sine gives
   *
   *     sigma = asin(u * d / sqrt(1 + u^2)) - atan(u)
   *
   * and that is exact, not an approximation: at the limb it returns acos(1/d), which is precisely
   * how much of a sphere you can see from distance d.
   */
  const exactAngle = (px: number, d: number, focal: number): number => {
    const u = px / focal;
    return Math.asin(Math.max(-1, Math.min(1, (u * d) / Math.sqrt(1 + u * u)))) - Math.atan(u);
  };

  /**
   * The inverse above, straightened out near the limb.
   *
   * Approaching the horizon the curve goes vertical: the last pixel before the edge is worth an
   * unbounded number of degrees, so a drag that grazes the rim would fling the globe. Past 0.985 of
   * the way out it continues at the slope it had, which is wrong exactly where the surface is
   * edge-on and unreadable anyway, and keeps the control usable at the rim.
   */
  const SHOULDER = 0.985;

  const angleAt = (px: number): number => {
    const d = dist();
    const focal = focalPx();
    // Pixel offset at which the exact form reaches SHOULDER of the way to the limb.
    const limit = (focal * SHOULDER) / Math.sqrt(d * d - SHOULDER * SHOULDER);
    const a = Math.abs(px);
    if (a <= limit) return exactAngle(px, d, focal);
    const at = exactAngle(limit, d, focal);
    const slope = at - exactAngle(limit - 1, d, focal);
    return Math.sign(px) * (at + (a - limit) * slope);
  };

  /** Geographic point under a client-space pixel, or null if the ray misses the globe. */
  const pick = (clientX: number, clientY: number): { lon: number; lat: number } | null => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);

    // Analytic against the unit sphere rather than against the ocean mesh: it cannot be thrown off
    // by tessellation, and it still answers when the mesh is mid-rebuild.
    const o = raycaster.ray.origin;
    const d = raycaster.ray.direction;
    const b = o.dot(d);
    const c = o.lengthSq() - 1;
    const disc = b * b - c;
    if (disc < 0) return null;

    hit.copy(d).multiplyScalar(-b - Math.sqrt(disc)).add(o);
    return {
      lon: Math.atan2(hit.x, hit.z) / DEG,
      lat: Math.asin(Math.max(-1, Math.min(1, hit.y))) / DEG,
    };
  };

  const apply = (): void => {
    const phi = lat * DEG;
    const lam = lon * DEG;
    const c = Math.cos(phi) * dist();
    camera.position.set(c * Math.sin(lam), Math.sin(phi) * dist(), c * Math.cos(lam));
    camera.lookAt(0, 0, 0);
    // Not optional, and not a formality. `lookAt` writes the quaternion but leaves matrixWorld
    // stale until something renders, and `pick` raycasts through matrixWorld. Without this the
    // cursor-anchoring passes below each measure from where the camera used to be, and the
    // correction they compute is not small-and-wrong but tens of degrees wrong.
    camera.updateMatrixWorld();
  };

  const clampLat = (v: number): number => Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, v));

  /**
   * Zoom about a pixel rather than about the middle of the screen.
   *
   * Read the coastline under the pointer, change the magnification, read whatever is under the
   * pointer now, and move the camera by the difference. Because the camera is described in degrees,
   * "move it by the difference" is literally a subtraction in the same units. Two passes, because
   * one is visibly short near the limb where the projection compresses hardest.
   */
  const zoomAt = (factor: number, clientX: number, clientY: number): void => {
    const before = pick(clientX, clientY);
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
    apply();
    if (!before) return;

    for (let i = 0; i < 2; i += 1) {
      const after = pick(clientX, clientY);
      if (!after) return;
      let d = before.lon - after.lon;
      if (d > 180) d -= 360;
      else if (d < -180) d += 360;
      lon += d;
      lat = clampLat(lat + (before.lat - after.lat));
      apply();
    }
  };

  const attach = (onChange: () => void): (() => void) => {
    const changed = (): void => {
      apply();
      onChange();
    };

    const onPointerDown = (e: PointerEvent): void => {
      // Capture keeps a drag alive when the pointer leaves the canvas, which matters here because
      // the globe sits against the panel edge. It throws when the pointer is already gone, which
      // a fast tap can arrange, and losing the capture is survivable where an exception is not.
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* drag still works, it just ends at the canvas edge */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Touching the globe stops it dead. Coasting through a grab feels broken.
      vLon = 0;
      vLat = 0;
      target = null;
      lastMove = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (pointers.size === 2) pinchDist = spread();
    };

    const spread = (): number => {
      const [a, b] = [...pointers.values()];
      if (!a || !b) return 0;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const centre = (): { x: number; y: number } => {
      const all = [...pointers.values()];
      const n = all.length || 1;
      return {
        x: all.reduce((s, p) => s + p.x, 0) / n,
        y: all.reduce((s, p) => s + p.y, 0) / n,
      };
    };

    const onPointerMove = (e: PointerEvent): void => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        const now = spread();
        if (pinchDist > 0 && now > 0) {
          const c = centre();
          zoomAt(now / pinchDist, c.x, c.y);
          pinchDist = now;
          onChange();
        }
        return;
      }

      const r = canvas.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const swept = (from: number, to: number, centre: number): number =>
        (angleAt(to - centre) - angleAt(from - centre)) / DEG;

      /*
       * Longitude is compressed by latitude, and the drag has to undo that.
       *
       * The camera turns about the pole, so a horizontal drag moves the grabbed point along its
       * parallel, and a parallel at latitude L is only cos(L) as long as the equator. Without this
       * the globe crawls under the pointer up north: measured, a 140px drag at 70 degrees left the
       * coastline 69 pixels behind, against 0.2 pixels at the equator.
       *
       * Floored at 0.25 rather than run to the pole. The exact correction diverges as cos goes to
       * zero, and near the axis it would turn a small drag into a spin.
       */
      const lonScale = 1 / Math.max(0.25, Math.cos(lat * DEG));
      lon -= swept(prev.x, e.clientX, cx) * lonScale;
      lat = clampLat(lat + swept(prev.y, e.clientY, cy));

      const t = performance.now();
      const elapsed = (t - lastMove.t) / 1000;
      if (elapsed > 0.004) {
        const cap = (v: number): number => Math.max(-MOMENTUM_MAX, Math.min(MOMENTUM_MAX, v));
        vLon = cap((-swept(lastMove.x, e.clientX, cx) * lonScale) / elapsed);
        vLat = cap(swept(lastMove.y, e.clientY, cy) / elapsed);
        lastMove = { x: e.clientX, y: e.clientY, t };
      }
      changed();
    };

    const onPointerUp = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
      pinchDist = 0;
      // A flick only coasts if it was still moving when it let go. Releasing after a pause
      // should leave the globe exactly where it was put.
      const stale = performance.now() - lastMove.t > 90;
      if (stale || reduced.matches || pointers.size > 0) {
        vLon = 0;
        vLat = 0;
      }
      if (vLon || vLat) onChange();
    };

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      // Exponential, so one notch is the same proportion of the way in wherever you start.
      // A 120-unit notch works out at about 14%, which takes roughly ten notches end to end.
      zoomAt(Math.exp(-e.deltaY * 0.0011), e.clientX, e.clientY);
      onChange();
    };

    const onDoubleClick = (): void => {
      flyTo(framing.lon, framing.lat, 1);
      onChange();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDoubleClick);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
    };
  };

  const step = (dt: number): boolean => {
    let moving = false;

    if (target) {
      // Critically damped, so it arrives without overshooting. An overshoot on a reset reads as a
      // bounce, and a bounce says "animation" where this needs to say "put back".
      // Shortest way round, so flying from 179E to 179W crosses the date line rather than
      // taking the long way through Greenwich.
      let shortest = target.lon - lon;
      shortest -= Math.round(shortest / 360) * 360;
      const acc = (gap: number, v: number): number =>
        SPRING_STIFFNESS * gap - SPRING_DAMPING * v;

      vLon += acc(shortest, vLon) * dt;
      vLat += acc(target.lat - lat, vLat) * dt;
      vZoom += acc(target.zoom - zoom, vZoom) * dt;
      lon += vLon * dt;
      lat += vLat * dt;
      zoom += vZoom * dt;

      const settled =
        Math.abs(shortest) < 0.05 && Math.abs(target.lat - lat) < 0.05 &&
        Math.abs(target.zoom - zoom) < 0.001 && Math.abs(vLon) < 0.5 && Math.abs(vLat) < 0.5;
      if (settled) {
        lon = target.lon;
        lat = target.lat;
        zoom = target.zoom;
        vLon = vLat = vZoom = 0;
        target = null;
      }
      return true;
    }

    if (Math.abs(vLon) > MOMENTUM_FLOOR || Math.abs(vLat) > MOMENTUM_FLOOR) {
      lon += vLon * dt;
      lat = clampLat(lat + vLat * dt);
      const decay = Math.exp(-dt / MOMENTUM_TAU);
      vLon *= decay;
      vLat *= decay;
      moving = true;
    } else {
      vLon = 0;
      vLat = 0;
    }
    return moving;
  };

  function flyTo(toLon: number, toLat: number, toZoom = zoom): void {
    const clamped = { lon: toLon, lat: clampLat(toLat), zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, toZoom)) };
    if (reduced.matches) {
      // Not eased, not shortened: arrived. A half-disabled motion setting is worse than none.
      ({ lon, lat, zoom } = clamped);
      target = null;
      vLon = vLat = vZoom = 0;
      apply();
      return;
    }
    vLon = 0;
    vLat = 0;
    vZoom = 0;
    target = clamped;
  }

  return {
    attach,
    step,
    apply,
    pick,
    flyTo,
    enter: () => {
      // Not shortened under reduced motion, skipped. A brief version of a motion somebody asked
      // not to see is still the motion.
      if (reduced.matches) return;
      lon = framing.lon - ENTRANCE_DEG;
      zoom = ENTRANCE_ZOOM;
      apply();
      target = { lon: framing.lon, lat: framing.lat, zoom: 1 };
    },
    project: (pLon, pLat) => {
      const phi = pLat * DEG;
      const lam = pLon * DEG;
      const c = Math.cos(phi);
      world.set(c * Math.sin(lam), Math.sin(phi), c * Math.cos(lam));
      // Behind the horizon: the surface normal at that point faces away from the eye.
      if (world.dot(camera.position.clone().sub(world)) <= 0) return null;
      const r = canvas.getBoundingClientRect();
      world.project(camera);
      return {
        x: r.left + ((world.x + 1) / 2) * r.width,
        y: r.top + ((1 - world.y) / 2) * r.height,
      };
    },
    state: () => ({ lon, lat, zoom }),
    setFit: (d) => {
      fit = d;
      apply();
    },
  };
}
