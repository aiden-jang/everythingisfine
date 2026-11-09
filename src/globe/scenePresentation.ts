import type { Group, Object3D, PerspectiveCamera, Vector3, WebGLRenderer } from "three";
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
import type { MoonfallView } from "./moonfall/scene";

import { createShadowChase } from "./shadowChase";
import { createObservationArrival } from "./observationArrival";
import { createObservationLayer } from "./observationLayer";
import type { ObservationView } from "../app/observations/types";

export type GlobePresentation = "planetarium" | "dayline" | AuroraRun | LocalView | null;
export type TonightPresentation = TonightView & { moonfall?: MoonfallView };
type LocalView = RadarView | TonightPresentation | FloatDiveView | ObservationView;

export function isLocalView(mode: GlobePresentation): mode is LocalView {
  return mode !== null && typeof mode === "object" && "kind" in mode;
}

export function isShadowChase(mode: GlobePresentation): boolean {
  return (
    isLocalView(mode) && mode.kind === "observation" && !!(mode.shadow || mode.sky?.sunCover !== undefined)
  );
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

  function step(dt: number, reduced: boolean) {
    dayline.value = showDayline ? lights.reveal.value : 0;
    veil?.trace(controls.auroraSweep());
    const diving = dive?.step(dt, reduced);
    const lunar = skyView?.moonfall?.step(dt, reduced);
    const approaching = arrival.step(dt, reduced);
    const tracing = observations?.step(dt, reduced) ?? false;
    if (lens && arrival.ready()) lensReveal = reduced ? 1 : Math.min(1, lensReveal + dt / 0.65);
    let following = false;
    if (chase && !reduced && arrival.ready()) {
      const current = controls.state();
      const { lon, lat, zoom } = chase.pose;
      if (Math.abs(lon - current.lon) + Math.abs(lat - current.lat) + Math.abs(zoom - current.zoom) > 0.003) {
        const gain = -Math.expm1(-7 * dt);
        controls.setView({
          lon: current.lon + (lon - current.lon) * gain,
          lat: current.lat + (lat - current.lat) * gain,
          zoom: current.zoom + (zoom - current.zoom) * gain,
        });
        following = true;
      }
    }
    return following || tracing || !!diving || !!lunar || approaching || (!!lens && lensReveal < 1);
  }

  function set(mode: GlobePresentation, geography: readonly Object3D[]) {
    const local = isLocalView(mode) ? mode : null;
    const observation = local?.kind === "observation" ? local : null;
    const weather = local?.kind === "radar" ? local : null;
    const returningFromArchive = arrival.set(observation);
    if (lens !== observation?.lens) lensReveal = 0;
    lens = observation?.lens;
    skyView = local?.kind === "tonight" ? local : (observation?.sky ?? null);
    const route = mode && typeof mode === "object" && "route" in mode ? mode.route : null;
    if (planetarium !== (mode === "planetarium")) controls.setPlanetarium(mode === "planetarium");
    planetarium = mode === "planetarium";
    if (route || oval) controls.setOverflight(route?.focus ?? null);
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
      if (!radar) {
        radar = createRadarSurface(projection);
        spin.add(radar.object);
      }
      const { target } = weather;
      if (target !== radarTarget) controls.flyTo(target.lon, target.lat, target.zoom);
    } else if (observation) {
      returnCamera ??= controls.state();
      const { target } = observation;
      if (target !== observationTarget && observation.sky?.sunCover === undefined)
        controls.flyTo(target.lon, target.lat, target.zoom);
    } else if (returnCamera) {
      if (
        mode === "dayline" ||
        mode === null ||
        ((returningFromArchive || observationTarget) && mode === "planetarium")
      )
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
    shadows: () => !!chase,
    renderMoon(renderer: WebGLRenderer, aspect: number) {
      return skyView?.moonfall?.render(renderer, aspect) ?? false;
    },
    skyOpacity(camera: PerspectiveCamera) {
      projection.value = controls.morph();
      const target = lens
        ? (lens.globe + (lens.map - lens.globe) * projection.value) * Math.min(1, camera.aspect)
        : 1;
      const zoom = target ** (lensReveal * lensReveal * (3 - 2 * lensReveal));
      if (camera.zoom !== zoom) {
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
      }
      dive?.size(camera.aspect);
      const amount = controls.localSky.amount();
      lights.apply(amount);
      return localLight?.draw(camera, amount, controls.localSky.ready() ? skyView : null) ?? 1;
    },
    dispose() {
      radar?.setImage(null);
      observations?.set(null);
      shadow?.dispose();
    },
  };
}
