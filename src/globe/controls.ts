import { Raycaster, Vector2, Vector3, type PerspectiveCamera } from "three";
import { RADIUS_ATMOSPHERE } from "../geo/land";
import { DEG } from "../geo/sphere";
import { MAP_HALF_WIDTH } from "./morph";

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

/*
 * The map's share of the framing distance, because the framing shot is a sphere's and the map is not.
 *
 * `fit` frames a 2-unit ball. The map is that ball unrolled to 4 by 2, so the same distance leaves the
 * whole planet in frame with the poles and half the Pacific paying for it: at zoom 1 on a desktop
 * that was 335 degrees of longitude and markers too small to aim at. Zooming the seismic band up to
 * fill the frame is what zoom 1 should mean on either view.
 *
 * Measured against the height-only fit, never against `fit`. Fitting by the tighter dimension is
 * correct for a ball and wrong for a plane that tiles: on a phone it framed the map's 4-unit width,
 * which left the world as a strip across the middle with a third of the canvas empty above and below
 * it. Cropping longitude costs nothing, because panning east wraps into the next copy.
 */
const MAP_FIT = 0.72;

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
   * The framing distances, recomputed on resize. Zoom is expressed relative to them.
   *
   * Two, because the two views are fitted by different dimensions. `distance` fits the ball by
   * whichever of width and height is tighter; `byHeight` ignores the width, which is what the map
   * wants and why it cannot share the first number.
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
  /** Screen position of a geographic point, or null when it is round the back. */
  project: (lon: number, lat: number) => { x: number; y: number } | null;
  /**
   * Degrees of the map covered by one screen pixel. Only meaningful once flat.
   *
   * Equal in both axes, because the projection puts 90 degrees in a world unit either way, and it is
   * degrees rather than kilometres because turning it into a distance needs a latitude and this does
   * not have an opinion about which one. See `scale.ts`.
   */
  degPerPx: () => number;
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
  const mapFit = (): number => heightFit * MAP_FIT;
  const dist = (): number => Math.max(DIST_FLOOR, (fit + (mapFit() - fit) * morph) / zoom);

  /*
   * How far out you are allowed to go, which is not the same question on the two views.
   *
   * `ZOOM_MIN` keeps the globe from being lost, and a plane cannot be lost: it tiles, so east of the
   * dateline is the next copy rather than an edge. The thing a map floor should protect is the whole
   * world being reachable, and on anything narrower than a desktop the fixed floor did not reach it.
   * A phone's map bottomed out at 155 degrees of longitude, so "see everywhere at once", which is the
   * only reason to leave the globe, was the one thing the map could not do.
   *
   * So the map's floor is derived: the zoom at which the frame is exactly 360 degrees wide. Whichever
   * of the two is further out wins, which keeps a very wide window from deriving a floor tighter than
   * the default framing and clamping the camera on load.
   *
   * Interpolated on morph rather than switched at a threshold, and re-applied in `setMorph`, so
   * leaving a zoomed-out map for the globe eases the camera up to the globe's floor across the
   * unwrap instead of snapping on the next wheel notch.
   */
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

    const o = raycaster.ray.origin;
    const d = raycaster.ray.direction;

    /*
     * On the map, the ray meets a plane rather than a ball.
     *
     * Raycasting the sphere still returns an answer here, which is worse than returning none: the
     * cursor names whichever earthquake happens to sit under that point of a globe nobody is looking
     * at. Hover appeared to work and pointed at the wrong event.
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

    // Analytic against the unit sphere rather than against the ocean mesh: it cannot be thrown off
    // by tessellation, and it still answers when the mesh is mid-rebuild.
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

  /*
   * The camera flies from orbiting a sphere to facing a plane, on the same number as the geometry.
   *
   * Sequencing it after the morph instead, or switching at the halfway point, both show a frame of a
   * flattened map viewed from an oblique angle, which looks like the projection has broken rather
   * than like a projection.
   *
   * The map camera keeps the same magnification model: `dist` is the framing distance over the zoom,
   * so a notch of wheel means the same proportion of the way in on either view.
   */
  const apply = (): void => {
    const phi = lat * DEG;
    const lam = lon * DEG;
    const c = Math.cos(phi) * dist();
    const orbitX = c * Math.sin(lam);
    const orbitY = Math.sin(phi) * dist();
    const orbitZ = c * Math.cos(lam);

    if (morph > 0) {
      /*
       * The map has no pan of its own: longitude and latitude *are* the camera position here, exactly
       * as on the globe, and the plane's x and y are just where those land.
       *
       * Holding a separate pan was the first version and it split the camera in two. Flying to a
       * region set longitude, which the map ignored, so clicking Indonesia zoomed and went nowhere;
       * dragging moved a pan the permalink had never heard of, so a shared map link came back to the
       * middle of the Atlantic. One position, and every existing thing that moves the camera works in
       * both views without knowing there are two.
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
  /*
   * Aims the camera, compounding off wherever it is already heading.
   *
   * Shared by the wheel and the keyboard so both feel the same and both survive being repeated faster
   * than the spring settles. Compounding off the animated value instead is the natural way to write it
   * and silently undershoots: two quick notches land on 1.59 instead of 1.70, because the second is
   * measured against a camera still in flight.
   */
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
    // Velocity is deliberately not zeroed the way flyTo does it: these are streams of small inputs,
    // and resetting on each one is what turns a scroll or a held key into a stutter.
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
   * Zooms toward the cursor, through the spring rather than straight onto the camera.
   *
   * It used to assign `zoom` directly, so a mouse wheel stepped the camera 14% per notch in one
   * frame: correct, anchored, and visibly a staircase. The spring that already smooths every `flyTo`
   * was sitting right there and the wheel was the one input bypassing it.
   *
   * The anchoring maths is unchanged and still runs against a real camera, just a hypothetical one:
   * the camera is moved to where it is *heading*, the correction is solved there, the result becomes
   * the new target, and the visible camera is put back for the spring to carry. Compounding off the
   * pending target rather than the current zoom is what makes ten fast notches travel ten notches
   * instead of racing the animation.
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

    /*
     * On the map a drag moves the map, not the camera's longitude.
     *
     * Reusing the orbit path with the morph applied would spin a plane, which is the kind of thing
     * that technically animates and means nothing. The switch is at the halfway point rather than
     * blended, because a drag that is half a rotation and half a pan tracks neither.
     */
    const panBy = (dxPx: number, dyPx: number): void => {
      const perPixel = (2 * dist() * Math.tan((fovDeg / 2) * DEG)) / canvas.clientHeight;
      lon -= ((dxPx * perPixel) / MAP_HALF_WIDTH) * 180;
      /*
       * Vertically the map is a wall, horizontally it is a loop.
       *
       * There is nothing above 90 north to look at, so the clamp keeps the poles at the edge of the
       * view rather than letting the map be dragged off into empty space. It accounts for how much of
       * the world the view covers: zoomed out far enough to see the whole map, there is nowhere to go
       * and latitude locks to the equator.
       */
      const halfView = dist() * Math.tan((fovDeg / 2) * DEG);
      const room = Math.max(0, 1 - halfView) * 90;
      lat = Math.max(-room, Math.min(room, lat + dyPx * perPixel * 90));
      // Wrapped rather than clamped: the map repeats, and hitting a wall at the date line on a
      // projection whose whole point is that it is continuous would be a strange place to stop.
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

    /*
     * Camera keys, on the window rather than the canvas.
     *
     * The canvas is `aria-hidden` and not focusable on purpose: the accessible feed is the interface
     * for a screen reader and the canvas is never it. But a sighted person with no mouse is a
     * different user, and until now they could not move the globe at all.
     *
     * Only while nothing is focused, so tabbing into the event list gives its arrows back and a slider
     * keeps its own. That is one rule rather than a list of elements to keep in step, which is how the
     * touch-target rule went wrong when it named regions instead of naming the thing.
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
    // Shortest way round, so flying from 179E to 179W crosses the date line rather than taking
    // the long way through Greenwich.
    let shortest = target.lon - lon;
    shortest -= Math.round(shortest / 360) * 360;
    const acc = (gap: number, v: number): number => SPRING_STIFFNESS * gap - SPRING_DAMPING * v;

    vLon += acc(shortest, vLon) * h;
    vLat += acc(target.lat - lat, vLat) * h;
    vZoom += acc(target.zoom - zoom, vZoom) * h;
    lon += vLon * h;
    lat += vLat * h;
    zoom += vZoom * h;

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
  };

  const step = (dt: number): boolean => {
    let moving = false;

    if (target) {
      /*
       * Integrated in small fixed slices, not in one step of whatever the frame happened to take.
       *
       * Semi-implicit Euler on a stiffness-100 spring is only stable while `stiffness * dt^2` stays
       * small, and the frame clamp of 50ms is not small enough. On a slow browser the entrance
       * overshot its destination and wobbled back: measured at 145.6, 146.3, 149.9 and 160.5
       * degrees against a target of 145, varying with frame rate. Varying with frame rate is the
       * signature of an integrator, not of a physics choice, and the bounce it produced is exactly
       * what critical damping was chosen to avoid.
       *
       * Slicing makes the flight identical at 15fps and at 120fps, which also means a reset takes
       * the same second on every machine.
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
      /*
       * The destination is wherever the camera is already aimed, not the default framing.
       *
       * A permalink calls `flyTo` while the globe is being set up and `enter` runs after the first
       * draw, so naming the framing here quietly discarded the shared camera: every link anybody
       * sent opened on the default view at zoom 1, which is the one outcome a permalink exists to
       * prevent. Nothing failed, which is why it survived: the entrance looked correct.
       */
      const to = target ?? { lon, lat, zoom };
      lon = to.lon - ENTRANCE_DEG;
      lat = to.lat;
      zoom = ENTRANCE_ZOOM;
      apply();
      target = to;
    },
    project: (pLon, pLat) => {
      const r = canvas.getBoundingClientRect();

      /*
       * On the map, project the point on the plane, not the point on the sphere.
       *
       * Everything that puts chrome over the canvas goes through here: the tooltip, the hover ring,
       * the selection ring. Left on the sphere they were all placed where the event would have been on
       * a globe nobody was looking at, which is why hover on the map appeared to do nothing.
       */
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
      // Behind the horizon: the surface normal at that point faces away from the eye.
      if (world.dot(camera.position.clone().sub(world)) <= 0) return null;
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
    // The visible height at distance d is 2 d tan(fov/2), which is what `focalPx` is the reciprocal
    // half of, so a pixel is d/focalPx world units and a world unit is 90 degrees.
    degPerPx: () => (90 * dist()) / focalPx(),
    setFit: (d, byHeight) => {
      fit = d;
      heightFit = byHeight;
      apply();
    },
  };
}
