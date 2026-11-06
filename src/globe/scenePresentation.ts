import type { Group, Vector3 } from "three";
import type { AuroraRun } from "../sources/auroraRoute";
import type { RadarView } from "../app/radar/radarCamera";
import type { Controls } from "./controls";
import type { createSurfaceLayers } from "./surfaceLayers";
import { createAuroraVeil } from "./auroraVeil";
import { createRadarSurface } from "./radarSurface";

export type GlobePresentation = "planetarium" | "dayline" | AuroraRun | RadarView | null;

export function isRadar(mode: GlobePresentation): mode is RadarView {
  return mode !== null && typeof mode === "object" && "kind" in mode;
}

export function createScenePresentation(
  spin: Group,
  catalogue: Group,
  controls: Controls,
  sun: Vector3,
  lights: ReturnType<typeof createSurfaceLayers>,
  dayline: { value: number },
) {
  let showDayline = false;
  let veil: ReturnType<typeof createAuroraVeil> | undefined;
  let oval: AuroraRun["route"] | null = null;
  let radar: ReturnType<typeof createRadarSurface> | undefined;
  let radarTarget: RadarView["target"] | undefined;
  let returnCamera: ReturnType<Controls["state"]> | undefined;

  function step() {
    dayline.value = showDayline ? lights.reveal.value : 0;
    veil?.trace(controls.auroraSweep());
  }

  function set(mode: GlobePresentation) {
    const weather = isRadar(mode) ? mode : null;
    const route = mode && typeof mode === "object" && "route" in mode ? mode.route : null;
    controls.setPlanetarium(mode === "planetarium");
    controls.setOverflight(route?.focus ?? null);
    if (mode === "dayline" && !showDayline) lights.begin();
    showDayline = mode === "dayline";
    if (route && !veil) {
      veil = createAuroraVeil(sun);
      spin.add(veil.object);
    }
    if (oval !== route) veil?.set(route);
    oval = route;

    catalogue.visible = weather === null;
    if (weather) {
      returnCamera ??= controls.state();
      if (!radar) {
        radar = createRadarSurface();
        spin.add(radar.object);
      }
      const { target } = weather;
      if (target !== radarTarget) controls.flyTo(target.lon, target.lat, target.zoom);
    } else if (returnCamera) {
      if (mode === "dayline" || mode === null)
        controls.flyTo(returnCamera.lon, returnCamera.lat, returnCamera.zoom);
      returnCamera = undefined;
    }
    radarTarget = weather?.target;
    radar?.setImage(weather?.image ?? null);
    step();
  }

  return { set, step, dispose: () => radar?.setImage(null) };
}
