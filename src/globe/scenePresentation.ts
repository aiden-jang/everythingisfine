import type { Group, Object3D, PerspectiveCamera, WebGLRenderer } from "three";
import type { AuroraRun } from "../sources/auroraRoute";
import { isGlobalRadar, type RadarView } from "../app/radar/radarCamera";
import type { LayerEmphasis, MapLayerPresentation } from "../app/weatherLayers";
import type { CameraState, Controls } from "./controlsTypes";
import type { createSurfaceLayers } from "./surfaceLayers";
import { createAuroraVeil } from "./auroraVeil";
import { createRadarReveal } from "./radarReveal";
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
import type { createLayerEmphasis } from "./layerEmphasis";
import { createObservationPicking } from "./observationPicking";
import { createDaylineLabel } from "./daylineLabel";

export type GlobePresentation =
  "planetarium" | "dayline" | "landing" | AuroraRun | LocalView | MapLayerPresentation | null;
export type LunarDeparture = { previous: TonightView; camera?: CameraState | undefined; scroll: number };
export type TonightPresentation = TonightView & {
  moonfall?: MoonfallView;
  lunarDeparture?: LunarDeparture;
  reference?: CameraState;
  earthReference?: true;
};
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
  lights: ReturnType<typeof createSurfaceLayers>,
  dayline: { value: number },
  canvas: HTMLCanvasElement,
  emphasis: ReturnType<typeof createLayerEmphasis>,
) {
  let showDayline = false;
  let planetarium = false;
  let skyCamera: ReturnType<Controls["state"]> | undefined;
  let skyView: TonightPresentation | null = null;
  let localLight: ReturnType<typeof createLocalSkyLight> | undefined;
  let veil: ReturnType<typeof createAuroraVeil> | undefined;
  let held: AuroraRun | null = null;
  let oval: AuroraRun["route"] | null = null;
  let radar: ReturnType<typeof createRadarSurface> | undefined;
  let observationTarget: ObservationView["target"] | undefined;
  let radarTarget: RadarView["target"] | undefined;
  let returnCamera: ReturnType<Controls["state"]> | undefined;

  const projection = { value: 0 };
  const arrival = createObservationArrival(controls, canvas);
  const radarReveal = createRadarReveal(controls, canvas);
  let observations: ReturnType<typeof createObservationLayer> | undefined;
  let dive: ReturnType<typeof createFloatPresentation> | undefined;
  let shadow: ReturnType<typeof createShadowChase> | undefined;
  let chase: ObservationView["shadow"];
  let lens: ObservationView["lens"];
  let lensReveal = 0;
  let comparisonFrame: ObservationView["comparisonFrame"];
  let registeredFrame: ObservationView["comparisonFrame"];
  let replay: ObservationView["follow"];
  let holdingGeography = false;
  let replayBank = 0;
  let replayPitch = 0;
  const orbital = createOrbitalFraming();
  const picking = createObservationPicking(canvas, controls);
  const placeDayline = createDaylineLabel(canvas, controls, lights.sun);
  let orbitalMoon = false;
  let overviewRadar = false;
  let liveFocus: LayerEmphasis | null = null;

  function step(dt: number, reduced: boolean, elapsed = dt, cameraMoving = true) {
    dayline.value = showDayline ? lights.reveal.value : 0;
    veil?.trace(controls.auroraSweep());
    const zoom = controls.state().zoom;
    const detail = Math.max(0, Math.min(1, (zoom - 1) / 1.7));
    const revealingRadar = radarReveal.step(elapsed, reduced);
    const focusingLayers = emphasis.step(liveFocus, dt, reduced);
    const radarArriving = radar?.step(
      dt,
      reduced,
      overviewRadar ? (0.7 + 0.3 * detail) * emphasis.radar() : 1,
    );
    const diving = dive?.step(dt, reduced, elapsed);
    const lunar = skyView?.moonfall?.step(dt, reduced);
    const approaching = arrival.step(dt, reduced);
    const tracing = observations?.step(dt, reduced, emphasis.weather()) ?? false;
    const orbiting = orbital.step(dt, reduced);
    if (lens && arrival.ready()) lensReveal = reduced ? 1 : Math.min(1, lensReveal + dt / 0.65);
    const guided = controls.guidance.following();
    const bank = guided && !reduced && controls.morph() === 0 ? (replay?.bank ?? radarReveal.bank()) : 0;
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
    if (
      comparisonFrame &&
      registeredFrame !== comparisonFrame &&
      controls.morph() === Number(comparisonFrame.map) &&
      arrival.ready() &&
      (!lens || lensReveal === 1) &&
      (!guided || (!cameraMoving && !following && !easing))
    ) {
      registeredFrame = comparisonFrame;
      comparisonFrame.onReady();
    }
    return (
      focusingLayers ||
      revealingRadar ||
      radarArriving ||
      easing ||
      following ||
      tracing ||
      orbiting ||
      !!diving ||
      !!lunar ||
      approaching ||
      (!!lens && !holdingGeography && lensReveal < 1)
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
    const hold = observation?.holdGeography === true;
    if (hold && !holdingGeography) controls.setView(controls.state());
    picking.set(observation);
    const weather = local?.kind === "radar" ? local : null;
    const float = local?.kind === "float-dive" ? local : null;
    const overflight = mode && typeof mode === "object" && "route" in mode ? mode : null;
    const route = overflight?.route ?? null;
    const previousSky = skyView;
    skyView = local?.kind === "tonight" ? local : (observation?.sky ?? null);
    if (skyView?.reference && (!previousSky?.reference || previousSky.city !== skyView.city))
      controls.flyTo(skyView.reference.lon, skyView.reference.lat, skyView.reference.zoom);
    const sweep = mode === null ? mapLayers?.radar?.reveal : undefined;
    controls.guidance.configure(
      skyView
        ? null
        : observation
          ? (observation.cameraKey ?? "observation")
          : weather
            ? `radar:${weather.region}`
            : (float ?? sweep ?? (route ? "aurora" : mode === "planetarium" ? mode : null)),
      () => {
        if (observation) {
          const pose = observation.follow ?? observation.shadow?.pose ?? observation.target;
          orbital.set(observation.frame.orbit);
          if (!hold) controls.flyTo(pose.lon, pose.lat, pose.zoom);
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
    comparisonFrame = observation?.comparisonFrame;
    if (!comparisonFrame) registeredFrame = undefined;
    if (lens !== observation?.lens) lensReveal = 0;
    lens = observation?.lens;
    replay = observation?.follow;
    if (skyView || guided || !observation?.frame.orbit)
      orbital.set(skyView ? undefined : observation?.frame.orbit);
    orbitalMoon = !!observation?.frame.orbit?.eclipse;
    if (planetarium !== (mode === "planetarium")) controls.setPlanetarium(mode === "planetarium");
    planetarium = mode === "planetarium";
    if (route !== oval && (guided || !route)) controls.setOverflight(route?.focus ?? null);
    const heldRun = overflight?.held ? overflight : null;
    if (heldRun !== held) controls.holdOverflight(!!heldRun);
    held = heldRun;
    if (skyView && !localLight) {
      localLight = createLocalSkyLight(lights.sun, controls.localSky.up, canvas);
      spin.add(localLight.object);
    }
    if (localLight)
      controls.setLocalSky(skyView?.earthReference ? null : skyView, planetarium && !returningFromArchive);
    if (mode === "dayline" && !showDayline) lights.begin();
    showDayline = mode === "dayline";
    if (route && !veil) {
      veil = createAuroraVeil(lights.sun);
      spin.add(veil.object);
    }
    if (oval !== route) veil?.set(route);
    oval = route;

    if (float && !dive) {
      dive = createFloatPresentation(controls, canvas);
      spin.add(dive.object);
    }
    dive?.set(float, mode === "dayline", mode === "dayline" || mode === null);
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
      if (
        !hold &&
        guided &&
        (holdingGeography || target !== observationTarget) &&
        observation.sky?.sunCover === undefined
      )
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
    radarReveal.set(sweep);
    holdingGeography = hold;
    observationTarget = observation?.target;
    radarTarget = weather?.target;
    const radarFrame = weather ?? mapLayers?.radar;
    liveFocus =
      mapLayers?.emphasis === "catalogue" ||
      (mode === null && (mapLayers?.emphasis !== "radar" || radarFrame?.image))
        ? (mapLayers?.emphasis ?? null)
        : null;
    overviewRadar = !weather && !!mapLayers?.radar;
    if (radarFrame && !radar) {
      radar = createRadarSurface(projection, radarReveal.uniforms);
      spin.add(radar.object);
    }
    radar?.setImage(radarFrame?.image ?? null, isGlobalRadar(radarFrame?.region));
    dayline.value = showDayline ? lights.reveal.value : 0;
  }

  return {
    set,
    step,
    acceptsLivePicks: () => liveFocus !== "catalogue",
    shadows: () => !!chase,
    orbitalMoon: () => orbitalMoon,
    renderMoon(renderer: WebGLRenderer, aspect: number) {
      return skyView?.moonfall?.render(renderer, aspect) ?? false;
    },
    skyOpacity(camera: PerspectiveCamera) {
      projection.value = controls.morph();
      veil?.opacity(Math.max(0, 1 - 2 * projection.value));
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
      placeDayline(dayline.value);
      dive?.size();
      const amount = controls.localSky.amount() * (1 - projection.value);
      lights.apply(amount);
      return (
        localLight?.draw(
          camera,
          amount,
          projection.value === 0 && amount === 1 && controls.localSky.ready() ? skyView : null,
        ) ?? 1
      );
    },
    dispose() {
      radar?.setImage(null);
      observations?.dispose();
      shadow?.dispose();
      dive?.dispose();
      picking.dispose();
    },
  };
}
