import type { ObservationSource } from "../../app/observations/types";
import { distanceKm } from "../../geo/sphere";
import { HOUR } from "./common";
import surface from "./drifter-surface.json";
import tracks from "./drifter-tracks.json";

const RECENT = "4401657";

function recordedSurface() {
  return surface.map(([stamp, lat, lon, temperature], index) => {
    const at = Date.parse(String(stamp));
    const point = { lat: Number(lat), lon: Number(lon) };
    const previous = surface[index - 1];
    const elapsed = previous ? (at - Date.parse(String(previous[0]))) / 1000 : 0;
    const speed =
      previous && elapsed > 0
        ? (1000 * distanceKm(Number(previous[2]), Number(previous[1]), point.lon, point.lat)) / elapsed
        : undefined;
    return { at, ...point, speed, temperature: Number(temperature) };
  });
}

export const drifter: ObservationSource = {
  options: [
    ...tracks.map(({ id }) => ({ id, label: `Recorded loop · ${id}` })),
    { id: RECENT, label: `Surface temperatures · ${RECENT}` },
  ],
  async load(option) {
    const selected = tracks.find(({ id }) => id === option) ?? tracks[0]!;
    const temperatureTrack = option === RECENT;
    const track = temperatureTrack
      ? recordedSurface()
      : selected.values.map(([days, lat, lon, east, north]) => ({
          at: Math.round(days! * 24 * HOUR),
          lat: lat!,
          lon: ((lon! + 540) % 360) - 180,
          speed: Math.hypot(east!, north!),
          temperature: undefined,
        }));
    const first = track[0];
    if (!first) throw new Error("Recorded track is empty");
    const frames = track.map((point, index) => ({
      at: point.at,
      paths: [
        { points: track, color: 0x42657c },
        { points: track.slice(0, index + 1), color: 0x89dfdf },
      ],
      marks: [{ ...point, size: 24, color: 0xd9ffff }],
      measurements: [
        { label: "Drifter ID", value: temperatureTrack ? RECENT : selected.id },
        {
          label: temperatureTrack ? "Speed between fixes" : "Estimated surface speed",
          value: point.speed === undefined ? "First fix" : `${point.speed.toFixed(2)} m/s`,
        },
        ...(point.temperature === undefined
          ? []
          : [{ label: "Sea-surface temperature", value: `${point.temperature.toFixed(2)} °C` }]),
        {
          label: "Position",
          value: `${Math.abs(point.lat).toFixed(2)}° ${point.lat < 0 ? "S" : "N"}, ${Math.abs(point.lon).toFixed(2)}° ${point.lon < 0 ? "W" : "E"}`,
        },
      ],
    }));
    return {
      target: { lon: first.lon, lat: first.lat, zoom: 2.2 },
      frames,
      series: [
        {
          label: temperatureTrack ? "Sea-surface temperature" : "Surface speed",
          samples: track.map(({ at, speed, temperature }) => [at, temperature ?? speed ?? 0]),
        },
      ],
      units: temperatureTrack ? "°C" : "m/s",
      note: temperatureTrack
        ? "Recorded NOAA surface drifter positions and temperature readings. Speed is calculated between consecutive fixes."
        : "NOAA’s recorded looper trajectories use quality-controlled interpolated positions and velocities. The bright section shows the part of the track already played.",
    };
  },
};
