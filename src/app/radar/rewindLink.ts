import type { CameraState } from "../../globe/controls";
import { radarPlaceValue, type SharedLayers } from "../layerLink";

export function rewindLink(
  href: string,
  camera: CameraState,
  point: NonNullable<SharedLayers["radarPlace"]>,
  at: number,
  flat: boolean,
): string {
  const url = new URL(href);
  const params = new URLSearchParams(url.hash.slice(1));
  const lon = ((((camera.lon + 180) % 360) + 360) % 360) - 180;
  params.set("v", "explore");
  params.set("at", [lon, camera.lat, camera.zoom].map((value) => value.toFixed(2)).join(","));
  params.set("p", flat ? "map" : "globe");
  params.set("radarAt", String(Math.round(at / 1000)));
  params.set("radarPlace", radarPlaceValue(point));
  url.hash = params.toString();
  return url.href;
}
