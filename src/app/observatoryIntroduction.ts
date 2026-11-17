import type { EarthScene } from "./useObservatory";
import type { Stop } from "./tour";

export function observatoryIntroduction({
  active,
  stop,
  scene,
  solar,
  aurora,
  deepAvailable,
  landing,
}: {
  active: boolean;
  stop: Stop | null;
  scene: EarthScene;
  solar: boolean;
  aurora: boolean;
  deepAvailable: boolean;
  landing: boolean;
}) {
  const title = active
    ? (stop?.heading ?? "Taking the long way around.")
    : scene === "depth"
      ? "Beneath the surface."
      : scene === "night"
        ? solar
          ? "Sun Watch"
          : aurora
            ? "Into the auroral oval."
            : "The other side of day."
        : landing
          ? "Look closer."
          : "Meanwhile, on Earth.";
  const description = active
    ? (stop?.description ?? "Travelling to the next view. The story begins when the camera arrives.")
    : scene === "depth"
      ? deepAvailable
        ? "Look through a regional cutaway at reported earthquake depths. The faint points show historical seismicity."
        : "Explore recorded earthquakes, fault motion and the history of Earth’s plates."
      : scene === "night"
        ? solar
          ? "See what GOES measures in X-rays and what spacecraft sample in the solar wind upstream of Earth. Aurora has its own forecast."
          : aurora
            ? "Follow NOAA’s forecast over Earth’s dark side. The raised glow illustrates the modeled oval."
            : "Earth settles into the horizon as constellations trace overhead. The sky follows the UTC readout."
        : landing
          ? "Earth, ocean and sky. Extraordinary things, hiding in plain sight."
          : "A live view of earthquakes, changing skies, and a restless planet.";
  return { title, description };
}
export function observatoryReadingLabel(float: boolean, player: boolean) {
  return float ? "Float Dive" : player ? undefined : "Earth observatory";
}
