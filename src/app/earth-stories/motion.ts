import type { EarthStoryId } from "./catalogue";
import type { CameraState } from "../../globe/controls";
import type { ReplayCamera } from "../observations/types";

export function storyCamera(id: EarthStoryId, target: CameraState, progress: number): ReplayCamera {
  const p = Math.min(1, Math.max(0, progress));
  const settle = 1 - (1 - p) ** 3;
  const bank = Math.sin(p * Math.PI);
  if (id === "seafloor")
    return {
      lon: 148 - 5.8 * settle,
      lat: 17 - 5.65 * settle,
      zoom: 1.7 + 0.15 * bank,
      bank: -0.045 * bank,
      pitch: 0.1 * bank,
    };
  if (id === "glacier")
    return {
      ...target,
      lon: target.lon + 0.35 * (1 - settle),
      lat: target.lat + 0.06 * bank,
      bank: -0.025 * bank,
      pitch: 0.035 * bank,
    };
  if (id === "aral") return { ...target, lon: target.lon + 0.35 * (1 - settle), bank: 0.025 * bank };
  if (id === "river")
    return { ...target, lon: -165 + 40 * settle, lat: 36 + 4 * bank, bank: -0.06 * bank, pitch: 0.08 * bank };
  if (id === "spring")
    return {
      ...target,
      lon: target.lon + 25 * bank,
      lat: -24 * Math.cos(p * Math.PI * 2),
      bank: 0.05 * bank,
    };
  if (id === "dust")
    return {
      lon: -20 - 65 * settle,
      lat: 23,
      zoom: 1.2 + 0.2 * bank,
      bank: -0.08 * bank,
      pitch: 0.12 * bank,
    };
  if (id === "ice" || id === "north")
    return {
      ...target,
      lon: target.lon + 26 * (1 - settle),
      lat: 68 + 8 * settle,
      bank: 0.09 * bank,
      pitch: 0.07 * bank,
    };
  if (id === "ozone")
    return { ...target, lon: target.lon - 22 * (1 - settle), lat: -66 - 10 * settle, bank: -0.08 * bank };
  if (id === "fire")
    return {
      ...target,
      lon: target.lon - 0.22 + 0.4 * settle,
      lat: target.lat - 0.18 + 0.35 * settle,
      bank: -0.04 * bank,
      pitch: 0.04 * bank,
    };
  if (id === "fault")
    return { ...target, lat: target.lat - 0.06 + 0.12 * settle, bank: 0.025 * bank, pitch: 0.03 * bank };
  return { ...target, lon: target.lon - 2 * (1 - settle), bank: -0.04 * bank };
}
