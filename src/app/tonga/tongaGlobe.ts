import { DEG } from "../../geo/sphere";
import { pointOnEarth } from "../observations/replayGeometry";
import type { ObservationView } from "../observations/types";
import {
  ANTIPODE,
  ORIGIN,
  WAVE_ORIGIN,
  antipode,
  orbit,
  timeIso,
  waveAngle,
  wavePoint,
} from "./tongaTimeline";

export const tongaTarget = { ...ORIGIN, zoom: 1.42 };
const bearings = Array.from({ length: 181 }, (_, i) => i * 2 * DEG);
const farSide = pointOnEarth(antipode);

export function tongaGeography(
  minute: number,
  station: { lon: number; lat: number },
  anchor?: number,
): Pick<ObservationView, "frame" | "follow"> {
  const shot = orbit(anchor ?? minute);
  const angle = waveAngle(minute);
  return {
    frame: {
      at: Date.parse(timeIso(minute)),
      paths:
        minute > WAVE_ORIGIN && minute < ANTIPODE
          ? [{ color: 0xb0e8f6, points: bearings.map((bearing) => pointOnEarth(wavePoint(angle, bearing))) }]
          : [],
      marks: [
        { ...ORIGIN, size: 15, color: 0xd6eaf6 },
        ...(minute > 400 && minute < 900
          ? [{ lon: station.lon, lat: station.lat, size: 20, color: 0x9ddff1 }]
          : []),
        ...(minute >= 1150 ? [{ ...farSide, size: minute >= ANTIPODE ? 21 : 13, color: 0xa4ccdf }] : []),
      ],
    },
    follow: { lon: shot.lon, lat: shot.lat, zoom: 0.65 + shot.scale * 0.47, bank: shot.bank },
  };
}
