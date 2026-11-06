import type { Group, PerspectiveCamera, Vector3 } from "three";
import type { AuroraRun } from "../sources/auroraRoute";
import type { RadarView } from "../app/radar/radarCamera";
import type { Controls } from "./controls";
import type { createSurfaceLayers } from "./surfaceLayers";
import { createAuroraVeil } from "./auroraVeil";
import { createRadarSurface } from "./radarSurface";
import { createLocalSkyLight } from "./localSkyLight";
import type { FloatDiveView } from "../app/float/floatPlayback";
import { createFloatPresentation } from "./floatPresentation";
import type { TonightView } from "../geo/tonight";

import { createObservationLayer } from "./observationLayer";
import type { ObservationView } from "../app/observations/types";

export type GlobePresentation = "planetarium" | "dayline" | AuroraRun | LocalView | null;
type LocalView = RadarView | TonightView | FloatDiveView | ObservationView;

export function isLocalView(mode: GlobePresentation): mode is LocalView {
  return mode !== null && typeof mode === "object" && "kind" in mode;
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
  let skyView: TonightView | null = null;
  let localLight: ReturnType<typeof createLocalSkyLight> | undefined;
  let veil: ReturnType<typeof createAuroraVeil> | undefined;
  let oval: AuroraRun["route"] | null = null;
  let radar: ReturnType<typeof createRadarSurface> | undefined;
  let observationTarget: ObservationView["target"] | undefined;
  let radarTarget: RadarView["target"] | undefined;
  let returnCamera: ReturnType<Controls["state"]> | undefined;

  const projection = { value: 0 };
  let observations: ReturnType<typeof createObservationLayer> | undefined;
  let dive: ReturnType<typeof createFloatPresentation> | undefined;

  function step(dt: number, reduced: boolean) {
    dayline.value = showDayline ? lights.reveal.value : 0;
    veil?.trace(controls.auroraSweep());
    const diving = dive?.step(dt, reduced);
    return (observations?.step(dt, reduced) ?? false) || !!diving;
  }

  function set(mode: GlobePresentation) {
    const local = isLocalView(mode) ? mode : null;
    const observation = local?.kind === "observation" ? local : null;
    const weather = local?.kind === "radar" ? local : null;
    skyView = local?.kind === "tonight" ? local : (observation?.sky ?? null);
    const route = mode && typeof mode === "object" && "route" in mode ? mode.route : null;
    if (planetarium !== (mode === "planetarium")) controls.setPlanetarium(mode === "planetarium");
    planetarium = mode === "planetarium";
    if (route || oval) controls.setOverflight(route?.focus ?? null);
    if (skyView && !localLight) {
      localLight = createLocalSkyLight(sun, controls.localSky.up, canvas);
      spin.add(localLight.object);
    }
    if (localLight) controls.setLocalSky(skyView, planetarium);
    if (mode === "dayline" && !showDayline) lights.begin();
    showDayline = mode === "dayline";
    if (route && !veil) {
      veil = createAuroraVeil(sun);
      spin.add(veil.object);
    }
    if (oval !== route) veil?.set(route);
    oval = route;

    const float = local?.kind === "float-dive" ? local : null;
    if (float && !dive) {
      dive = createFloatPresentation(controls);
      spin.add(dive.object);
    }
    dive?.set(float, mode === "dayline");
    const overlay =
      observation ??
      (weather?.lightning
        ? { kind: "observation" as const, frame: weather.lightning, image: null, target: weather.target }
        : null);
    if (overlay && !observations) {
      observations = createObservationLayer(projection);
      spin.add(observations.object);
    }
    observations?.set(overlay);
    catalogue.visible = local === null;
    if (weather) {
      returnCamera ??= controls.state();
      if (!radar) {
        radar = createRadarSurface(projection);
        spin.add(radar.object);
      }
      const { target } = weather;
      if (target !== radarTarget) controls.flyTo(target.lon, target.lat, target.zoom);
    } else if (observation) {
      returnCamera ??= controls.state();
      const { target } = observation;
      if (target !== observationTarget) controls.flyTo(target.lon, target.lat, target.zoom);
    } else if (returnCamera) {
      if (mode === "dayline" || mode === null)
        controls.flyTo(returnCamera.lon, returnCamera.lat, returnCamera.zoom);
      returnCamera = undefined;
    }
    observationTarget = observation?.target;
    radarTarget = weather?.target;
    radar?.setImage(weather?.image ?? null);
    dayline.value = showDayline ? lights.reveal.value : 0;
  }

  return {
    set,
    step,
    skyOpacity(camera: PerspectiveCamera) {
      projection.value = controls.morph();
      dive?.size(camera.aspect);
      const amount = controls.localSky.amount();
      lights.apply(amount);
      return localLight?.draw(camera, amount, controls.localSky.ready() ? skyView : null) ?? 1;
    },
    dispose() {
      radar?.setImage(null);
      observations?.set(null);
    },
  };
}
