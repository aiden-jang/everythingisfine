import type { Group, Object3D, PerspectiveCamera, Vector3, WebGLRenderer } from "three";
import type { AuroraRun } from "../sources/auroraRoute";
import { isGlobalRadar, type RadarView } from "../app/radar/radarCamera";
import type { MapLayerPresentation } from "../app/weatherLayers";
import type { Controls } from "./controls";
import type { createSurfaceLayers } from "./surfaceLayers";
import { createAuroraVeil } from "./auroraVeil";
import { createRadarSurface } from "./radarSurface";
import { createLocalSkyLight } from "./localSkyLight";
import type { FloatDiveView } from "../app/float/floatPlayback";
import { createFloatPresentation } from "./floatPresentation";
import type { TonightView } from "../geo/tonight";
import type { MoonfallView } from "./moonfall/scene";

import { createShadowChase } from "./shadowChase";
import { positionObservationAnchors } from "./observationAnchors";
import { createObservationArrival } from "./observationArrival";
import { createObservationLayer } from "./observationLayer";
import type { ObservationView } from "../app/observations/types";
import { createOrbitalFraming } from "./orbitalFraming";
import { createObservationPicking } from "./observationPicking";

export type GlobePresentation =
  "planetarium" | "dayline" | "landing" | AuroraRun | LocalView | MapLayerPresentation | null;
export type TonightPresentation = TonightView & { moonfall?: MoonfallView };
type LocalView = RadarView | TonightPresentation | FloatDiveView | ObservationView;

export function isLocalView(mode: GlobePresentation): mode is LocalView {
  return mode !== null && typeof mode === "object" && "kind" in mode && mode.kind !== "map-layers";
}

export function isShadowChase(mode: GlobePresentation): boolean {
  return (
    isLocalView(mode) && mode.kind === "observation" && !!(mode.shadow || mode.sky?.sunCover !== undefined)
  );
}

export function isRecordedFlight(mode: GlobePresentation): boolean {
  return isLocalView(mode) && mode.kind === "observation" && !!mode.follow;
}

export function createScenePresentation(
  spin: Group,
  catalogue: Group,
  controls: Controls,
  sun: Vector3,
  lights: ReturnType<typeof createSurfaceLayers>,
  dayline: { value: number },
  canvas: HTMLCanvasElement,
) {
  let showDayline = false;
  let planetarium = false;
  let skyCamera: ReturnType<Controls["state"]> | undefined;
  let skyView: TonightPresentation | null = null;
  let localLight: ReturnType<typeof createLocalSkyLight> | undefined;
  let veil: ReturnType<typeof createAuroraVeil> | undefined;
  let oval: AuroraRun["route"] | null = null;
  let radar: ReturnType<typeof createRadarSurface> | undefined;
  let observationTarget: ObservationView["target"] | undefined;
  let radarTarget: RadarView["target"] | undefined;
  let returnCamera: ReturnType<Controls["state"]> | undefined;

  const projection = { value: 0 };
  const arrival = createObservationArrival(controls, canvas);
  let observations: ReturnType<typeof createObservationLayer> | undefined;
  let dive: ReturnType<typeof createFloatPresentation> | undefined;
  let shadow: ReturnType<typeof createShadowChase> | undefined;
  let chase: ObservationView["shadow"];
  let lens: ObservationView["lens"];
  let lensReveal = 0;
  let replay: ObservationView["follow"];
  let replayBank = 0;
  let replayPitch = 0;
  const orbital = createOrbitalFraming();
  const picking = createObservationPicking(canvas, controls);
  let orbitalMoon = false;

  function step(dt: number, reduced: boolean) {
    dayline.value = showDayline ? lights.reveal.value : 0;
    veil?.trace(controls.auroraSweep());
    const diving = dive?.step(dt, reduced);
    const lunar = skyView?.moonfall?.step(dt, reduced);
    const approaching = arrival.step(dt, reduced);
    const tracing = observations?.step(dt, reduced) ?? false;
    const orbiting = orbital.step(dt, reduced);
    if (lens && arrival.ready()) lensReveal = reduced ? 1 : Math.min(1, lensReveal + dt / 0.65);
    const guided = controls.guidance.following();
    const bank = guided && replay && !reduced && controls.morph() === 0 ? (replay.bank ?? 0) : 0;
    const pitch = guided && replay && !reduced && controls.morph() === 0 ? (replay.pitch ?? 0) : 0;
    const easing = Math.abs(bank - replayBank) + Math.abs(pitch - replayPitch) > 0.0005;
    const rotate = replayBank !== bank || replayPitch !== pitch;
    if (rotate) {
      const gain = easing && !reduced ? -Math.expm1(-8 * dt) : 1;
      replayBank += (bank - replayBank) * gain;
      replayPitch += (pitch - replayPitch) * gain;
      controls.setReplayAngle(replayBank, replayPitch);
    }
    let following = false;
    const destination = replay ?? chase?.pose;
    if (guided && destination && !reduced && arrival.ready()) {
      const current = controls.state();
      const { lon, lat, zoom } = destination;
      const turn = ((((lon - current.lon) % 360) + 540) % 360) - 180;
      if (Math.abs(turn) + Math.abs(lat - current.lat) + Math.abs(zoom - current.zoom) > 0.003) {
        const gain = -Math.expm1(-7 * dt);
        controls.setView({
          lon: current.lon + turn * gain,
          lat: current.lat + (lat - current.lat) * gain,
          zoom: current.zoom + (zoom - current.zoom) * gain,
        });
        following = true;
      }
    }
    if (rotate && !following) controls.apply();
    return (
      easing ||
      following ||
      tracing ||
      orbiting ||
      !!diving ||
      !!lunar ||
      approaching ||
      (!!lens && lensReveal < 1)
    );
  }

  function set(mode: GlobePresentation, geography: readonly Object3D[]) {
    const mapLayers =
      mode && typeof mode === "object" && "kind" in mode && mode.kind === "map-layers" ? mode : null;
    if (mapLayers) mode = mapLayers.base ?? null;
    if (mode === "landing") mode = "dayline";
    if (mode === "planetarium" && !planetarium) skyCamera = returnCamera ?? controls.state();
    const local = isLocalView(mode) ? mode : null;
    const observation = local?.kind === "observation" ? local : null;
    picking.set(observation);
    const weather = local?.kind === "radar" ? local : null;
    const float = local?.kind === "float-dive" ? local : null;
    const route = mode && typeof mode === "object" && "route" in mode ? mode.route : null;
    skyView = local?.kind === "tonight" ? local : (observation?.sky ?? null);
    controls.guidance.configure(
      skyView
        ? null
        : observation
          ? (observation.cameraKey ?? "observation")
          : weather
            ? `radar:${weather.region}`
            : (float ?? (route ? "aurora" : mode === "planetarium" ? mode : null)),
      () => {
        if (observation) {
          const pose = observation.follow ?? observation.shadow?.pose ?? observation.target;
          orbital.set(observation.frame.orbit);
          controls.flyTo(pose.lon, pose.lat, pose.zoom);
        } else if (weather) {
          controls.flyTo(weather.target.lon, weather.target.lat, weather.target.zoom);
        } else if (float) {
          controls.flyTo(float.profile.lon, float.profile.lat, 1.35);
        } else if (route) controls.setOverflight(route.focus);
        else if (mode === "planetarium") {
          if (skyCamera) controls.flyTo(skyCamera.lon, skyCamera.lat, skyCamera.zoom);
          controls.setPlanetarium(true);
        }
      },
      !!observation?.follow || !!observation?.shadow || !!float || !!route,
    );
    const guided = controls.guidance.following();
    const returningFromArchive = arrival.set(observation);
    if (lens !== observation?.lens) lensReveal = 0;
    lens = observation?.lens;
    replay = observation?.follow;
    if (guided || !observation?.frame.orbit) orbital.set(skyView ? undefined : observation?.frame.orbit);
    orbitalMoon = !!observation?.frame.orbit?.eclipse;
    if (planetarium !== (mode === "planetarium")) controls.setPlanetarium(mode === "planetarium");
    planetarium = mode === "planetarium";
    if (route !== oval && (guided || !route)) controls.setOverflight(route?.focus ?? null);
    if (skyView && !localLight) {
      localLight = createLocalSkyLight(sun, controls.localSky.up, canvas);
      spin.add(localLight.object);
    }
    if (localLight) controls.setLocalSky(skyView, planetarium && !returningFromArchive);
    if (mode === "dayline" && !showDayline) lights.begin();
    showDayline = mode === "dayline";
    if (route && !veil) {
      veil = createAuroraVeil(sun);
      spin.add(veil.object);
    }
    if (oval !== route) veil?.set(route);
    oval = route;

    if (float && !dive) {
      dive = createFloatPresentation(controls);
      spin.add(dive.object);
    }
    dive?.set(float, mode === "dayline");
    const overlay =
      observation ??
      mapLayers?.observation ??
      (weather?.lightning
        ? { kind: "observation" as const, frame: weather.lightning, image: null, target: weather.target }
        : null);
    if (overlay && !observations) {
      observations = createObservationLayer(projection);
      spin.add(observations.object);
    }
    observations?.set(overlay);
    chase = observation?.shadow;
    if (chase && observation && !shadow) {
      shadow = createShadowChase(projection);
      spin.add(shadow.object);
    }
    if (shadow) {
      shadow.object.visible = !!chase;
      if (chase && observation) shadow.set(observation.frame.at, chase.point);
    }
    for (const layer of geography) layer.visible = !observation?.frame.reconstruction;
    catalogue.visible = local === null;
    if (weather) {
      returnCamera ??= controls.state();
      const { target } = weather;
      if (guided && target !== radarTarget) controls.flyTo(target.lon, target.lat, target.zoom);
    } else if (observation) {
      returnCamera ??= controls.state();
      const { target } = observation;
      if (guided && target !== observationTarget && observation.sky?.sunCover === undefined)
        controls.flyTo(target.lon, target.lat, target.zoom);
    } else if (returnCamera) {
      if (
        mode === "dayline" ||
        mode === null ||
        mapLayers ||
        ((returningFromArchive || observationTarget) && mode === "planetarium")
      )
        controls.flyTo(returnCamera.lon, returnCamera.lat, returnCamera.zoom);
      returnCamera = undefined;
    }
    observationTarget = observation?.target;
    radarTarget = weather?.target;
    const radarFrame = weather ?? mapLayers?.radar;
    if (radarFrame && !radar) {
      radar = createRadarSurface(projection);
      spin.add(radar.object);
    }
    radar?.setImage(radarFrame?.image ?? null, isGlobalRadar(radarFrame?.region));
    dayline.value = showDayline ? lights.reveal.value : 0;
  }

  return {
    set,
    step,
    shadows: () => !!chase,
    orbitalMoon: () => orbitalMoon,
    renderMoon(renderer: WebGLRenderer, aspect: number) {
      return skyView?.moonfall?.render(renderer, aspect) ?? false;
    },
    skyOpacity(camera: PerspectiveCamera) {
      projection.value = controls.morph();
      const target = lens
        ? (lens.globe + (lens.map - lens.globe) * projection.value) * Math.min(1, camera.aspect)
        : 1;
      const zoom =
        target ** (lensReveal * lensReveal * (3 - 2 * lensReveal)) *
        orbital.magnification(controls.magnification(), projection.value);
      if (camera.zoom !== zoom) {
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
      }
      orbital.apply(
        camera,
        projection.value,
        controls.apply,
        (observationTarget?.zoom ?? 1) / controls.state().zoom,
      );
      positionObservationAnchors(canvas, controls, !!observationTarget || !!skyView || planetarium);
      dive?.size(camera.aspect);
      const amount = controls.localSky.amount();
      lights.apply(amount);
      return localLight?.draw(camera, amount, controls.localSky.ready() ? skyView : null) ?? 1;
    },
    dispose() {
      radar?.setImage(null);
      observations?.dispose();
      shadow?.dispose();
      picking.dispose();
    },
  };
}
