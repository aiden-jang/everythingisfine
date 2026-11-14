import { DEFAULT_CAMERA } from "../globe/framing";
import { useCallback, useRef } from "react";
import type { FlyTo } from "../globe/cameraTarget";
import type { CameraState } from "../globe/controls";
import type { Permalink } from "./permalink";

export function useGlobeCamera(shared: Partial<Permalink>, setReady: (ready: boolean) => void) {
  const flyTo = useRef<FlyTo>(() => {});
  const camera = useRef<CameraState>({
    lon: shared.lon ?? DEFAULT_CAMERA.lon,
    lat: shared.lat ?? DEFAULT_CAMERA.lat,
    zoom: shared.zoom ?? DEFAULT_CAMERA.zoom,
  });
  const read = useRef(() => camera.current);
  const onReady = useCallback(
    (fly: FlyTo, current: () => CameraState) => {
      flyTo.current = fly;
      read.current = current;
      setReady(true);
      fly(camera.current.lon, camera.current.lat, camera.current.zoom);
    },
    [setReady],
  );
  return { flyTo, camera, read, onReady };
}

export function explorerCamera(
  read: { readonly current: () => CameraState },
  flyTo: { readonly current: FlyTo },
  flat: boolean,
  setFlat: (flat: boolean) => void,
) {
  return {
    flat,
    read: () => read.current(),
    restore: (saved: CameraState, map?: boolean) => {
      if (map !== undefined && map !== flat) setFlat(map);
      flyTo.current(saved.lon, saved.lat, saved.zoom);
    },
  };
}
