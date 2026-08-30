import { Raycaster, Vector2, Vector3, type PerspectiveCamera } from "three";
import { RADIUS_ATMOSPHERE } from "../geo/land";
import { DEG, spanDeg } from "../geo/sphere";
import { MAP_HALF_WIDTH } from "./morph";

/* Orbiting the globe, hand-written. OrbitControls slides a pan target, and on a sphere there is no target
   to slide - only a rotation that puts the same coastline back under the pointer. See ARCHITECTURE.md. */

/** Beyond this the up vector flips and the globe rolls over. */
const LAT_LIMIT = 85;

/* Zoom is magnification: 1 is the framing shot, 2 is twice as close, distance is fit/zoom. Don't store
   it as a multiple of the distance - the wheel handler duly zoomed out when scrolled up. */
/* A long flight pulls back over the middle and settles, or arriving looks the same as nudging. Short
   hops get none of it: a camera that dollies out for a nudge is drawing attention to itself. */
const ARC_MIN_DEG = 25;
const ARC_FULL_DEG = 110;
/** Extra distance at the top of the arc, as a fraction of the flight's own magnification. */
const ARC_PULLBACK = 0.45;

const ZOOM_MIN = 0.75;
const ZOOM_MAX = 3;

/* The map is the ball unrolled to 4 by 2, so it needs its own fraction. Measure against the
   height-only fit: fitting by the tighter dimension is right for a ball and, on a phone, framed the
   map's width and left a strip across the middle. */
const MAP_FIT = 0.72;

/** Flick decay. A third of a second of coasting reads as weight; longer reads as ice. */
const MOMENTUM_TAU = 0.32;
const MOMENTUM_FLOOR = 0.6; // deg/sec, below which it has stopped
/**
 * Ceiling on a flick, in deg/sec. Coast distance is velocity times MOMENTUM_TAU, and unclamped a hard
 * flick measured 131 degrees - a third of the planet from one gesture. 200 coasts about 64.
 */
const MOMENTUM_MAX = 200;

/** How far back the entrance starts. Forty-two degrees is about a second, not a title sequence. */
const ENTRANCE_DEG = 42;
const ENTRANCE_ZOOM = 0.88;

/** DESIGN.md section 8. Damping 20 against stiffness 100 is exactly critical: no overshoot. */
const SPRING_STIFFNESS = 100;
const SPRING_DAMPING = 20;

/** Largest slice the spring is integrated over. See the note in `step`. */
const MAX_SPRING_STEP = 1 / 120;

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
  /**
   * The framing distances, recomputed on resize. Two of them: `distance` fits the ball by whichever of
   * width and height is tighter, and `byHeight` ignores the width, which is what the map wants.
   */
  setFit: (distance: number, byHeight: number) => void;
  /** Geographic point under a client pixel, or null off the globe. Hover in step 9 needs this. */
  pick: (clientX: number, clientY: number) => { lon: number; lat: number } | null;
  /** The whole camera in three numbers. This is exactly what a permalink has to carry. */
  state: () => CameraState;
  /** Springs the camera to a place. Instant under reduced motion, per DESIGN.md section 8. */
  flyTo: (lon: number, lat: number, zoom?: number) => void;
  /** The one entrance. Does nothing at all under reduced motion, which is the correct nothing. */
  enter: () => void;
  /** 0 globe, 1 map. Drag becomes a pan and the facing tests fade out as this reaches 1. */
  setMorph: (t: number) => void;
  morph: () => number;
  /** Screen position of a geographic point, or null when it is round the back. See ARCHITECTURE.md. */
  project: (lon: number, lat: number, radius?: number) => { x: number; y: number } | null;
  /** Degrees of map covered by one screen pixel. Only meaningful once flat. See ARCHITECTURE.md. */
  degPerPx: (atZoom?: number) => number;
  /**
   * How far around the globe a pixel offset from the centre actually is.
   *
   * Not `degPerPx * px`. That is the flat map's straight line; this camera sits about two radii out, so
   * the sphere's curve decides, and the two disagree threefold at the distances a panel lift asks about.
   */
  degForPx: (px: number, atZoom?: number) => number;
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
  /** 0 globe, 1 map. Held here as well as in the scene, because the camera has to agree with it. */
  let morph = 0;
  let fit = 4;
  let heightFit = 4;

  let vLon = 0;
  let vLat = 0;
  let vZoom = 0;
  /** Where the camera is being pulled, or null. Double-click reset and fly-to are one mechanism, so they feel the same. */
  /*
   * `arc` hangs off the target, not beside it. Six other places assign or clear the target, so a
   * flight interrupted by a drag drops its arc without anything having to remember to cancel it.
   */
  let target:
    | { lon: number; lat: number; zoom: number; arc?: { span: number; pull: number; fromZoom: number } }
    | null = null;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointers = new Map<number, { x: number; y: number }>();
  let lastMove = { x: 0, y: 0, t: 0 };
  let pinchDist = 0;

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const hit = new Vector3();
  const world = new Vector3();

  /**
   * A hard floor that does not rely on the zoom clamp being right. At ZOOM_MAX the camera stops 0.19
   * radii outside the atmosphere shell by luck - move the framing, the field of view or the ceiling and
   * it ends up inside the shell with the screen washed out.
   */
  const DIST_FLOOR = RADIUS_ATMOSPHERE + 0.12;
  const mapFit = (): number => heightFit * MAP_FIT;
  const distAt = (z: number): number => Math.max(DIST_FLOOR, (fit + (mapFit() - fit) * morph) / z);
  const dist = (): number => distAt(zoom);

  /* How far out you may go, which is a different question on each view: a globe can be lost, a plane
     cannot, because it tiles. See ARCHITECTURE.md. */
  const zoomFloor = (): number => {
    const wholeWorld =
      (mapFit() * Math.tan((fovDeg / 2) * DEG) * camera.aspect) / MAP_HALF_WIDTH;
    return ZOOM_MIN + (Math.min(ZOOM_MIN, wholeWorld) - ZOOM_MIN) * morph;
  };

  const clampZoom = (v: number): number => Math.max(zoomFloor(), Math.min(ZOOM_MAX, v));

  /**
   * Pixels per unit of projected height at the origin plane. The one constant the projection needs.
   */
  const focalPx = (): number => canvas.clientHeight / (2 * Math.tan((fovDeg / 2) * DEG));

  /* How far around the globe a pixel offset from centre actually is. See ARCHITECTURE.md. */
  const exactAngle = (px: number, d: number, focal: number): number => {
    const u = px / focal;
    return Math.asin(Math.max(-1, Math.min(1, (u * d) / Math.sqrt(1 + u * u)))) - Math.atan(u);
  };

  /**
   * Where the inverse above is straightened out. At the horizon the curve goes vertical, so the last
   * pixel before the edge is worth unbounded degrees and a drag grazing the rim would fling the globe.
   */
  const SHOULDER = 0.985;

  const angleAt = (px: number, atDist?: number): number => {
    const d = atDist ?? dist();
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

    const o = raycaster.ray.origin;
    const d = raycaster.ray.direction;

    /*
     * On the map the ray meets a plane, not a ball. Raycasting the sphere still returns an answer,
     * which is worse than none: hover looked like it worked and named the wrong earthquake.
     */
    if (morph > 0.5) {
      if (Math.abs(d.z) < 1e-6) return null;
      const t = -o.z / d.z;
      if (t < 0) return null;
      const x = o.x + d.x * t;
      const y = o.y + d.y * t;
      if (Math.abs(y) > 1) return null;
      return {
        lon: ((((((x / MAP_HALF_WIDTH) * 180) + 180) % 360) + 360) % 360) - 180,
        lat: y * 90,
      };
    }

    // Analytic against the unit sphere, not against the ocean mesh: tessellation cannot throw it off
    // and it still answers while the mesh is rebuilding.
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

  /* Orbit and plane swap on the same number as the geometry. Sequence it after the morph, or switch at
     the halfway point, and one frame shows a flat map seen from an angle. */
  const apply = (): void => {
    const phi = lat * DEG;
    const lam = lon * DEG;
    const c = Math.cos(phi) * dist();
    const orbitX = c * Math.sin(lam);
    const orbitY = Math.sin(phi) * dist();
    const orbitZ = c * Math.cos(lam);

    if (morph > 0) {
      /*
       * The map has no pan of its own: longitude and latitude *are* the camera here. A separate pan split
       * the camera in two, and shared map links came back to the middle of the Atlantic.
       */
      const flatX = (lon / 180) * MAP_HALF_WIDTH;
      const flatY = lat / 90;
      const flatZ = dist();
      camera.position.set(
        orbitX + (flatX - orbitX) * morph,
        orbitY + (flatY - orbitY) * morph,
        orbitZ + (flatZ - orbitZ) * morph,
      );
      camera.lookAt(flatX * morph, flatY * morph, 0);
      camera.updateMatrixWorld();
      return;
    }

    camera.position.set(orbitX, orbitY, orbitZ);
    camera.lookAt(0, 0, 0);
    // Required. `lookAt` writes the quaternion but leaves matrixWorld stale until something renders,
    // and `pick` raycasts through matrixWorld. Skip it and the anchoring below measures from where the
    // camera used to be, off by tens of degrees.
    camera.updateMatrixWorld();
  };

  const clampLat = (v: number): number => Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, v));

  /**
   * Zoom about a pixel rather than the middle of the screen: read what is under the pointer, change the
   * magnification, read it again, move by the difference. Twice, because one pass is visibly short near
   * the limb where the projection compresses hardest.
   */
  /* Compounds off where the camera is heading, not where it is. Off the animated value, two quick
     notches land on 1.59 rather than 1.70. */
  const aim = (
    dest: { lon: number; lat: number; zoom: number }, instant = reduced.matches,
  ): void => {
    if (instant) {
      lon = dest.lon;
      lat = dest.lat;
      zoom = dest.zoom;
      target = null;
      vLon = vLat = vZoom = 0;
      apply();
      return;
    }
    // Velocity is not zeroed here, unlike flyTo. These are streams of small inputs, and resetting on
    // each one turns a scroll or a held key into a stutter.
    target = dest;
  };

  /** One key press of camera movement, in degrees and in zoom factor. */
  const nudge = (dLon: number, dLat: number, factor = 1): void => {
    const base = target ?? { lon, lat, zoom };
    aim({
      lon: base.lon + dLon,
      lat: clampLat(base.lat + dLat),
      zoom: clampZoom(base.zoom * factor),
    });
  };

  /*
   * Through the spring, never straight onto the camera: assigning `zoom` gives a correct, anchored
   * staircase. The anchoring solves against a hypothetical camera moved to where it is heading, which is
   * what lets ten fast notches travel ten notches instead of racing the animation.
   */
  const zoomAt = (factor: number, clientX: number, clientY: number): void => {
    const before = pick(clientX, clientY);
    const base = target ?? { lon, lat, zoom };
    const nextZoom = clampZoom(base.zoom * factor);

    const wasLon = lon;
    const wasLat = lat;
    const wasZoom = zoom;
    lon = base.lon;
    lat = base.lat;
    zoom = nextZoom;
    apply();

    if (before) {
      for (let i = 0; i < 2; i += 1) {
        const after = pick(clientX, clientY);
        if (!after) break;
        let d = before.lon - after.lon;
        if (d > 180) d -= 360;
        else if (d < -180) d += 360;
        lon += d;
        lat = clampLat(lat + (before.lat - after.lat));
        apply();
      }
    }

    const dest = { lon, lat, zoom };
    if (reduced.matches) {
      target = null;
      vLon = vLat = vZoom = 0;
      return;
    }

    lon = wasLon;
    lat = wasLat;
    zoom = wasZoom;
    apply();
    aim(dest);
  };

  const attach = (onChange: () => void): (() => void) => {
    const changed = (): void => {
      apply();
      onChange();
    };

    const onPointerDown = (e: PointerEvent): void => {
      // Capture keeps a drag alive when the pointer leaves the canvas, and the globe sits against the
      // panel edge. It throws when the pointer is already gone, which a fast tap can arrange.
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

    /* On the map a drag moves the map, not the camera's longitude - reusing the orbit path would spin a
       plane. Switched at the halfway point: half rotation and half pan tracks neither. */
    const panBy = (dxPx: number, dyPx: number): void => {
      const perPixel = (2 * dist() * Math.tan((fovDeg / 2) * DEG)) / canvas.clientHeight;
      lon -= ((dxPx * perPixel) / MAP_HALF_WIDTH) * 180;
      /* Vertically the map is a wall, horizontally a loop. The clamp accounts for how much is in frame, so
         zoomed out far enough to see all of it, latitude locks to the equator. */
      const halfView = dist() * Math.tan((fovDeg / 2) * DEG);
      const room = Math.max(0, 1 - halfView) * 90;
      lat = Math.max(-room, Math.min(room, lat + dyPx * perPixel * 90));
      // Wrapped, not clamped. The map repeats, so a wall at the date line would be a strange place to stop.
      lon = ((((lon + 180) % 360) + 360) % 360) - 180;
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

      if (morph > 0.5) {
        panBy(e.clientX - prev.x, e.clientY - prev.y);
        vLon = 0;
        vLat = 0;
        apply();
        onChange();
        return;
      }

      const r = canvas.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const swept = (from: number, to: number, centre: number): number =>
        (angleAt(to - centre) - angleAt(from - centre)) / DEG;

      /* Longitude is squeezed by latitude and the drag has to undo it: a horizontal drag moves the grabbed
         point along its parallel, which at latitude L is only cos(L) as long as the equator. See
         ARCHITECTURE.md. */
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
      // A flick only coasts if it was still moving when it let go. Release after a pause and the globe stays put.
      const stale = performance.now() - lastMove.t > 90;
      if (stale || reduced.matches || pointers.size > 0) {
        vLon = 0;
        vLat = 0;
      }
      if (vLon || vLat) onChange();
    };

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      // Exponential, so a notch is the same proportion of the way in wherever you start: about 14%.
      zoomAt(Math.exp(-e.deltaY * 0.0011), e.clientX, e.clientY);
      onChange();
    };

    const onDoubleClick = (): void => {
      flyTo(framing.lon, framing.lat, 1);
      onChange();
    };

    /*
     * Camera keys live on the window: the canvas is `aria-hidden` and unfocusable on purpose, because the
     * feed is the screen-reader interface, but a sighted person with no mouse still has to move the globe.
     *
     * Only while nothing is focused, so the event list keeps its arrows and a slider keeps its own.
     */
    const onKeyDown = (e: KeyboardEvent): void => {
      if (document.activeElement && document.activeElement !== document.body) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const step = e.shiftKey ? 24 : 8;
      switch (e.key) {
        case "ArrowLeft": nudge(-step, 0); break;
        case "ArrowRight": nudge(step, 0); break;
        case "ArrowUp": nudge(0, step); break;
        case "ArrowDown": nudge(0, -step); break;
        case "+": case "=": nudge(0, 0, 1.25); break;
        case "-": case "_": nudge(0, 0, 1 / 1.25); break;
        case "0": flyTo(framing.lon, framing.lat, 1); break;
        default: return;
      }
      e.preventDefault();
      onChange();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  };

  /** One fixed slice of the flight. Critically damped, so it arrives without a bounce. */
  const stepSpring = (h: number): void => {
    if (!target) return;
    // Shortest way round, so 179E to 179W crosses the date line instead of going through Greenwich.
    let shortest = target.lon - lon;
    shortest -= Math.round(shortest / 360) * 360;
    const acc = (gap: number, v: number): number => SPRING_STIFFNESS * gap - SPRING_DAMPING * v;

    vLon += acc(shortest, vLon) * h;
    vLat += acc(target.lat - lat, vLat) * h;
    lon += vLon * h;
    lat += vLat * h;

    if (target.arc) {
      /*
       * Zoom is a function of distance covered, not a fourth spring. Chasing a moving zoom target with
       * its own spring lags it, so the pullback came out shallow and the climb and descent did not match.
       */
      const { span, pull, fromZoom } = target.arc;
      const progress = Math.max(0, Math.min(1, 1 - spanDeg(lon, lat, target.lon, target.lat) / span));
      // Zero at both ends, one over the middle, so departure and arrival are untouched.
      const lift = Math.sin(Math.PI * progress);
      zoom = clampZoom((fromZoom + (target.zoom - fromZoom) * progress) / (1 + pull * lift));
      vZoom = 0;
    } else {
      vZoom += acc(target.zoom - zoom, vZoom) * h;
      zoom += vZoom * h;
    }

    /* Zoom is out of the arrival test while an arc flies, or it never passes: position settles at 0.05
       degrees of slack while the lift holds zoom 0.002 off against a 0.001 threshold. */
    const settled =
      Math.abs(shortest) < 0.05 && Math.abs(target.lat - lat) < 0.05 &&
      (target.arc ? true : Math.abs(target.zoom - zoom) < 0.001) &&
      Math.abs(vLon) < 0.5 && Math.abs(vLat) < 0.5;
    if (settled) {
      lon = target.lon;
      lat = target.lat;
      zoom = target.zoom;
      vLon = vLat = vZoom = 0;
      target = null;
    }
  };

  const step = (dt: number): boolean => {
    let moving = false;

    if (target) {
      /*
       * Fixed slices, not one step of whatever the frame took. Semi-implicit Euler is only stable while
       * stiffness * dt^2 stays small, and the 50ms frame clamp is not small enough: the entrance overshot by
       * up to 15 degrees, varying with frame rate. Slicing makes 15fps and 120fps identical.
       */
      const slices = Math.min(64, Math.max(1, Math.ceil(dt / MAX_SPRING_STEP)));
      const h = dt / slices;
      for (let i = 0; i < slices && target; i += 1) stepSpring(h);
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
    const clamped = { lon: toLon, lat: clampLat(toLat), zoom: clampZoom(toZoom) };
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
    const span = spanDeg(lon, lat, clamped.lon, clamped.lat);
    const reach = (span - ARC_MIN_DEG) / (ARC_FULL_DEG - ARC_MIN_DEG);
    const pull = ARC_PULLBACK * Math.max(0, Math.min(1, reach));
    target = pull > 0
      ? { ...clamped, arc: { span, pull, fromZoom: zoom } }
      : clamped;
  }

  return {
    attach,
    step,
    apply,
    pick,
    flyTo,
    enter: () => {
      // Skipped under reduced motion, not shortened. A brief version of a motion somebody asked not to
      // see is still the motion.
      if (reduced.matches) return;
      /* Wherever the camera is already aimed, not the default framing. A permalink calls `flyTo` during
         setup and `enter` runs after the first draw, so naming the framing here threw away every shared
         camera - silently, which is why it survived. */
      const to = target ?? { lon, lat, zoom };
      lon = to.lon - ENTRANCE_DEG;
      lat = to.lat;
      zoom = ENTRANCE_ZOOM;
      apply();
      target = to;
    },
    project: (pLon, pLat, radius = 1) => {
      const r = canvas.getBoundingClientRect();

      /* On the map, project onto the plane. Every piece of chrome over the canvas comes through here, and on
         the sphere they all sat where the event would have been on a globe nobody was looking at. */
      if (morph > 0.5) {
        let dLon = pLon - lon;
        dLon -= Math.round(dLon / 360) * 360;
        world.set(((lon + dLon) / 180) * MAP_HALF_WIDTH, pLat / 90, 0);
        world.project(camera);
        return {
          x: r.left + ((world.x + 1) / 2) * r.width,
          y: r.top + ((1 - world.y) / 2) * r.height,
        };
      }

      const phi = pLat * DEG;
      const lam = pLon * DEG;
      const c = Math.cos(phi);
      world.set(c * Math.sin(lam), Math.sin(phi), c * Math.cos(lam));
      // Behind the horizon: the surface normal faces away from the eye. Asked at the surface even when
      // a depth was given, because that is the question the shader asks.
      if (world.dot(camera.position.clone().sub(world)) <= 0) return null;
      if (radius !== 1) world.multiplyScalar(radius);
      world.project(camera);
      return {
        x: r.left + ((world.x + 1) / 2) * r.width,
        y: r.top + ((1 - world.y) / 2) * r.height,
      };
    },
    setMorph: (t) => {
      morph = Math.max(0, Math.min(1, t));
      // The floor moves with the morph, so a camera parked beyond the globe's has to be brought back
      // as the map rolls up. The pending target too, or the spring drags it straight back out.
      zoom = clampZoom(zoom);
      if (target) target.zoom = clampZoom(target.zoom);
      apply();
    },
    morph: () => morph,
    state: () => ({ lon, lat, zoom }),
    // Visible height at distance d is 2 d tan(fov/2), and `focalPx` is the reciprocal half of that, so
    // a pixel is d/focalPx world units and a world unit is 90 degrees.
    degPerPx: (atZoom) => (90 * (atZoom === undefined ? dist() : distAt(atZoom))) / focalPx(),
    degForPx: (px, atZoom) => angleAt(px, atZoom === undefined ? undefined : distAt(atZoom)) / DEG,
    setFit: (d, byHeight) => {
      fit = d;
      heightFit = byHeight;
      apply();
    },
  };
}
