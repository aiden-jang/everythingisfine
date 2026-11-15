import { locationAttempt } from "./attempt";
import { coarsePosition, type CoarsePosition } from "./position";

export const DEVICE_LOCATION_UNAVAILABLE = "Device location is unavailable. You can still choose a city.";

export function requestDeviceLocation(
  apply: (point: CoarsePosition) => void,
  status: (message: string) => void,
  target: EventTarget = window,
  geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined = navigator.geolocation,
) {
  if (!geolocation) {
    status(DEVICE_LOCATION_UNAVAILABLE);
    return () => {};
  }
  status("Finding your approximate position…");
  const attempt = locationAttempt(target, () => {
    clearTimeout(timeout);
    status("Location request cancelled. You can still choose a city.");
  });
  const fail = (code: number) => {
    if (!attempt.finish()) return;
    clearTimeout(timeout);
    status(
      code === 1
        ? "Location permission was denied. You can still choose a city."
        : code === 3
          ? "Location took too long. You can still choose a city."
          : DEVICE_LOCATION_UNAVAILABLE,
    );
  };
  const timeout = setTimeout(() => fail(3), 8_000);
  try {
    geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = coarsePosition({ lon: coords.longitude, lat: coords.latitude });
        if (!point) return fail(2);
        if (!attempt.finish()) return;
        clearTimeout(timeout);
        apply(point);
        status("Showing your approximate position.");
      },
      (error) => fail(error.code),
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 0 },
    );
  } catch {
    fail(2);
  }
  return () => {
    clearTimeout(timeout);
    attempt.finish();
  };
}
