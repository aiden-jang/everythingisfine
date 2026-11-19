import { DEFAULT_CAMERA } from "../globe/framing";
import { useCallback, useEffect, useRef } from "react";
import type { FlyTo } from "../globe/cameraTarget";
import type { CameraState } from "../globe/controls";
import type { Permalink } from "./permalink";
import { mayLocateInitially } from "./location/position";
import { requestApproximateLocation } from "./location/approximate";

export function useGlobeCamera(shared: Partial<Permalink>, setReady: (ready: boolean) => void) {
  const flyTo = useRef<FlyTo>(() => {});
  const home = useRef<CameraState>({ ...DEFAULT_CAMERA });
  const untouched = useRef(true);
  const stopLocation = useRef<() => void>(() => {});
  const flight = useRef<FlyTo | null>(null);
  const camera = useRef<CameraState>({
    lon: shared.lon ?? DEFAULT_CAMERA.lon,
    lat: shared.lat ?? DEFAULT_CAMERA.lat,
    zoom: shared.zoom ?? DEFAULT_CAMERA.zoom,
  });
  const read = useRef(() => camera.current);
  useEffect(() => {
    if (!untouched.current || !mayLocateInitially(shared)) return;
    const stop = requestApproximateLocation((point) => {
      home.current = { ...point, zoom: DEFAULT_CAMERA.zoom };
      camera.current = home.current;
      flight.current?.(point.lon, point.lat, home.current.zoom);
    });
    stopLocation.current = stop;
    return stop;
  }, [shared]);
  const onReady = useCallback(
    (fly: FlyTo, current: () => CameraState) => {
      flight.current = fly;
      flyTo.current = (...args) => {
        untouched.current = false;
        stopLocation.current();
        fly(...args);
      };
      read.current = current;
      setReady(true);
      fly(camera.current.lon, camera.current.lat, camera.current.zoom);
    },
    [setReady],
  );
  return { flyTo, camera, read, onReady, home };
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
