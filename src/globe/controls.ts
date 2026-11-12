import { attachCameraInput } from "./cameraInput";
import { createCameraGuidance } from "./cameraGuidance";
import { createAuroraFlight } from "./auroraFlight";
import { createLocalSkyCamera } from "./localSkyCamera";
import type { CameraState, Controls, Framing } from "./controlsTypes";
export type { CameraState, Controls } from "./controlsTypes";
import { createPlanetarium } from "./planetarium";
import {
  createGeographicPicking,
  createGeographicProjection,
  createUnfoldCamera,
  perspectiveAngle,
} from "./cameraProjection";
import { createDepthDive } from "./depthDive";
import { createCameraRig } from "./cameraRig";
import {
  advanceCameraSpring,
  cameraRigTarget,
  entranceFrom,
  entrancePose,
  entranceDone,
  type CameraTarget,
} from "./cameraFlight";
import { LAT_LIMIT } from "./framing";
import { createOrbitDistance } from "./orbitDistance";
import type { PerspectiveCamera } from "three";
import { DEG, spanDeg, toVec3 } from "../geo/sphere";
import { MAP_HALF_WIDTH } from "./morph";

/* Orbiting the globe, hand-written. OrbitControls slides a pan target, and on a sphere there is no target
   to slide - only a rotation that puts the same coastline back under the pointer. See ARCHITECTURE.md#srcglobecontrolsts. */

// A long flight pulls back in the middle; short nudges keep their distance.
const ARC_MIN_DEG = 25;
const ARC_FULL_DEG = 110;
/** Extra distance at the top of the arc, as a fraction of the flight's own magnification. */
const ARC_PULLBACK = 0.45;

/** Flick decay. A third of a second of coasting reads as weight; longer reads as ice. */
const MOMENTUM_TAU = 0.32;
const MOMENTUM_FLOOR = 0.6; // deg/sec, below which it has stopped
/**
 * Ceiling on a flick, in deg/sec. Coast distance is velocity times MOMENTUM_TAU, and unclamped a hard
 * flick measured 131 degrees - a third of the planet from one gesture. 200 coasts about 64.
 */
const MOMENTUM_MAX = 200;

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
  const distance = createOrbitDistance(camera, fovDeg);

  let vLon = 0;
  let vLat = 0;
  let vZoom = 0;
  // Reset, arc and arrival share one target so steering cancels the whole shot.
  let target: CameraTarget | null = null;
  const rig = createCameraRig(camera, canvas);
  const sky = createPlanetarium(camera);
  const state = (): CameraState => ({ lon, lat, zoom });
  const horizon = createLocalSkyCamera(camera, state, flyTo);
  const aurora = createAuroraFlight(camera);
  const dive = createDepthDive(camera);
  const flightPose = { lon, lat, zoom },
    flightVelocity = { lon: 0, lat: 0, zoom: 0 };

  const intended = (): CameraState => (target && !target.intro ? target : { lon, lat, zoom });

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const guidance = createCameraGuidance();

  const project = createGeographicProjection(camera, canvas);
  const unfold = createUnfoldCamera(camera);
  const interruptFraming = (): void => {
    if (guidance.interrupt()) {
      target = null;
      vLon = vLat = vZoom = 0;
    }
    sky.interrupt();
    aurora.interrupt();
    dive.interrupt();
  };
  const stepFraming = (dt: number): boolean => {
    if (morph !== 0) return false;
    const revealing = sky.step(dt, reduced.matches);
    const diving = dive.step(dt, reduced.matches, target === null);
    const flying = aurora.step(dt, reduced.matches);
    const landing = horizon.step(dt, reduced.matches, target === null);
    return revealing || diving || flying || landing;
  };

  const distAt = (zoom: number): number => distance.at(zoom, morph);
  const dist = (): number => distAt(zoom);
  const clampZoom = (zoom: number): number => distance.clamp(zoom, morph);

  /**
   * Pixels per unit of projected height at the origin plane. The one constant the projection needs.
   */
  const focalPx = (): number => (camera.zoom * canvas.clientHeight) / (2 * Math.tan((fovDeg / 2) * DEG));

  const angleAt = (px: number, atDist?: number): number => perspectiveAngle(px, atDist ?? dist(), focalPx());

  const pick = createGeographicPicking(camera, canvas, () => morph);

  const apply = (): void => {
    if (morph > 0) {
      unfold.place(lon, lat, dist(), morph);
      rig.apply(true);
      camera.updateMatrixWorld();
      return;
    }
    unfold.reset();
    camera.position.set(...toVec3(lon, lat, dist()));
    camera.lookAt(0, 0, 0);
    dive.apply();
    rig.apply(false);
    sky.apply();
    aurora.apply();
    horizon.apply();
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
  const aim = (dest: { lon: number; lat: number; zoom: number }, instant = reduced.matches): void => {
    if (instant) {
      lon = dest.lon;
      lat = dest.lat;
      zoom = dest.zoom;
      target = null;
      vLon = vLat = vZoom = 0;
      rig.snap();
      apply();
      return;
    }
    // Velocity is not zeroed here, unlike flyTo. These are streams of small inputs, and resetting on
    // each one turns a scroll or a held key into a stutter.
    target = dest;
  };

  /** One key press of camera movement, in degrees and in zoom factor. */
  const nudge = (dLon: number, dLat: number, factor = 1): void => {
    interruptFraming();
    const base = intended();
    aim({
      lon: base.lon + dLon,
      lat: clampLat(base.lat + dLat),
      zoom: clampZoom(base.zoom * factor),
    });
  };

  // Anchor against the pending pose so successive wheel events do not compound a moving reference.
  const zoomAt = (factor: number, clientX: number, clientY: number): void => {
    interruptFraming();
    const anchored = pick(clientX, clientY) !== null;
    const base = intended();
    const nextZoom = clampZoom(base.zoom * factor);

    const wasLon = lon;
    const wasLat = lat;
    const wasZoom = zoom;
    const wasLens = camera.zoom;
    lon = base.lon;
    lat = base.lat;
    zoom = base.zoom;
    camera.zoom = (wasLens * distance.magnification(zoom, morph)) / distance.magnification(wasZoom, morph);
    camera.updateProjectionMatrix();
    apply();
    const before = anchored ? pick(clientX, clientY) : null;
    zoom = nextZoom;
    camera.zoom = (wasLens * distance.magnification(zoom, morph)) / distance.magnification(wasZoom, morph);
    camera.updateProjectionMatrix();
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
    camera.zoom = wasLens;
    camera.updateProjectionMatrix();
    apply();
    aim(dest);
  };

  const attach = (onChange: () => void): (() => void) =>
    attachCameraInput(canvas, {
      blocked: horizon.active,
      grab: () => {
        vLon = vLat = 0;
      },
      begin: () => {
        interruptFraming();
        target = null;
        vLon = vLat = vZoom = 0;
      },
      drag: (prev, next, lastMove, elapsed) => {
        if (morph > 0.5) {
          const perPixel = dist() / focalPx();
          lon -= (((next.x - prev.x) * perPixel) / MAP_HALF_WIDTH) * 180;
          lat = clampLat(lat + (next.y - prev.y) * perPixel * 90);
          lon = ((((lon + 180) % 360) + 360) % 360) - 180;
          vLon = vLat = 0;
        } else {
          const r = canvas.getBoundingClientRect();
          const cx = r.left + r.width / 2,
            cy = r.top + r.height / 2;
          const swept = (from: number, to: number, centre: number): number =>
            (angleAt(to - centre) - angleAt(from - centre)) / DEG;
          const lonScale = 1 / Math.max(0.25, Math.cos(lat * DEG));
          lon -= swept(prev.x, next.x, cx) * lonScale;
          lat = clampLat(lat + swept(prev.y, next.y, cy));
          if (elapsed > 0.004) {
            const cap = (v: number) => Math.max(-MOMENTUM_MAX, Math.min(MOMENTUM_MAX, v));
            vLon = cap((-swept(lastMove.x, next.x, cx) * lonScale) / elapsed);
            vLat = cap(swept(lastMove.y, next.y, cy) / elapsed);
          }
        }
        apply();
      },
      release: (stale, remaining) => {
        if (stale || reduced.matches || remaining > 0) vLon = vLat = 0;
        if (vLon || vLat) onChange();
      },
      zoom: zoomAt,
      nudge,
      reset: () => {
        if (!guidance.recenter()) flyTo(framing.lon, framing.lat, 1);
      },
      change: onChange,
    });

  const step = (dt: number): boolean => {
    const framingMoving = stepFraming(dt);
    const rigMoving = rig.step(dt, cameraRigTarget(target, { lon, lat, zoom }), reduced.matches || morph > 0);
    if (target) {
      if (reduced.matches) {
        ({ lon, lat, zoom } = target);
        target = null;
        vLon = vLat = vZoom = 0;
        rig.snap();
        return false;
      }
      if (target.intro) {
        ({ lon, lat, zoom } = entrancePose(target, dt));
        if (entranceDone(target)) target = null;
      } else {
        Object.assign(flightPose, { lon, lat, zoom });
        Object.assign(flightVelocity, { lon: vLon, lat: vLat, zoom: vZoom });
        if (!advanceCameraSpring(flightPose, flightVelocity, target, dt, clampZoom)) target = null;
        ({ lon, lat, zoom } = flightPose);
        ({ lon: vLon, lat: vLat, zoom: vZoom } = flightVelocity);
      }
      return true;
    }
    let moving = rigMoving || framingMoving;

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
    sky.resume();
    const clamped = { lon: toLon, lat: clampLat(toLat), zoom: clampZoom(toZoom) };
    if (reduced.matches) {
      // Not eased, not shortened: arrived. A half-disabled motion setting is worse than none.
      aim(clamped, true);
      return;
    }
    vLon = 0;
    vLat = 0;
    vZoom = 0;
    const span = spanDeg(lon, lat, clamped.lon, clamped.lat);
    const reach = (span - ARC_MIN_DEG) / (ARC_FULL_DEG - ARC_MIN_DEG);
    const pull = ARC_PULLBACK * Math.max(0, Math.min(1, reach));
    target = pull > 0 ? { ...clamped, arc: { span, pull, fromZoom: zoom } } : clamped;
  }

  return {
    attach,
    step,
    apply,
    pick,
    flyTo,
    guidance,
    setReplayAngle: rig.setReplayAngle,
    setView: (pose) => aim(pose, true),
    enter: () => {
      if (sky.wanted() || dive.wanted()) return;
      sky.clear();
      dive.clear();
      if (reduced.matches) return;
      /* Wherever the camera is already aimed, not the default framing. A permalink calls `flyTo` during
         setup and `enter` runs after the first draw, so naming the framing here threw away every shared
         camera - silently, which is why it survived. */
      vLon = vLat = vZoom = 0;
      const to = target ?? { lon, lat, zoom };
      const from = entranceFrom(to);
      ({ lon, lat, zoom } = from);
      target = { lon: to.lon, lat: to.lat, zoom: to.zoom, intro: { elapsed: 0, from } };
      const lens = cameraRigTarget(target, from);
      rig.snap(lens.bank, lens.lift);
      apply();
    },
    project: (pLon, pLat, radius = 1) => project(pLon, pLat, radius, morph, lon),
    setMorph: (t) => {
      if (t > 0 && target?.intro) target = null;
      morph = Math.max(0, Math.min(1, t));
      stepFraming(0);
      // The floor moves with the morph, so a camera parked beyond the globe's has to be brought back
      // as the map rolls up. The pending target too, or the spring drags it straight back out.
      zoom = clampZoom(zoom);
      if (target) target.zoom = clampZoom(target.zoom);
      apply();
    },
    morph: () => morph,
    magnification: () => distance.magnification(zoom, morph),
    setPlanetarium: (on) => {
      sky.set(on);
      if (morph === 0) sky.step(0, reduced.matches);
      apply();
    },
    setLocalSky: (view, restore) => {
      horizon.set(view, restore);
      stepFraming(0);
      apply();
    },
    localSky: horizon,
    skyReady: sky.ready,
    setOverflight: (focus) => {
      const side = focus && (focus.lat > 0 ? 1 : -1);
      aurora.set(side);
      if (focus && side) flyTo(focus.lon, side * Math.min(82, Math.max(72, Math.abs(focus.lat) + 10)), 1.18);
      stepFraming(0);
      apply();
    },
    auroraSweep: aurora.sweep,
    setDive: (on) => {
      dive.set(on);
      stepFraming(0);
      apply();
    },
    diveReady: dive.ready,
    framingReady: () => sky.ready() && dive.ready() && aurora.ready() && horizon.ready(),
    state,
    // Visible height at distance d is 2 d tan(fov/2), and `focalPx` is the reciprocal half of that, so
    // a pixel is d/focalPx world units and a world unit is 90 degrees.
    degPerPx: (atZoom) => (90 * (atZoom === undefined ? dist() : distAt(atZoom))) / focalPx(),
    degForPx: (px, atZoom) => angleAt(px, atZoom === undefined ? undefined : distAt(atZoom)) / DEG,
    setFit: (d, byHeight) => {
      distance.fit(d, byHeight);
      apply();
    },
  };
}
