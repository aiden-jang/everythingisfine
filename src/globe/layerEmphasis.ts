import type { Mesh, ShaderMaterial, SphereGeometry } from "three";
import type { EventLayer } from "./events";
import type { MarkLayer } from "./marks";
import type { RingLayer } from "./rings";
import type { LayerEmphasis } from "../app/weatherLayers";

const neutral = { radar: 1, quakes: 1, reports: 1, aurora: 1, weather: 1 };
const focus = {
  radar: { radar: 1, quakes: 0.42, reports: 0.48, aurora: 0.48, weather: 0.42 },
  earthquakes: { radar: 0.38, quakes: 1, reports: 0.49, aurora: 0.48, weather: 0.4 },
  aurora: { radar: 0.31, quakes: 0.42, reports: 0.51, aurora: 1, weather: 0.38 },
  catalogue: { radar: 0, quakes: 0, reports: 0, aurora: 0, weather: 0 },
};
const channels = Object.keys(neutral) as (keyof typeof neutral)[];

export function createLayerEmphasis(
  events: EventLayer,
  marks: MarkLayer,
  rings: RingLayer,
  night: Mesh<SphereGeometry, ShaderMaterial>,
) {
  const value = { ...neutral };
  const reports = marks.object.material;
  const reportsOpacity = reports.opacity;
  const nightUniforms = night.material.uniforms;
  const quakeWeight = events.object.material.uniforms["uLayerWeight"]!;
  const ringWeight = rings.object.material.uniforms["uLayerWeight"]!;
  return {
    radar: () => value.radar,
    weather: () => value.weather,
    step(subject: LayerEmphasis | null, dt: number, reduced: boolean) {
      if (subject === "aurora" && !nightUniforms["uAuroraOn"]!.value) subject = null;
      if (subject === "earthquakes" && events.object.geometry.drawRange.count === 0) subject = null;
      const goal = subject ? focus[subject] : neutral;
      const ease = -Math.expm1(-(subject === "catalogue" ? 24 : 15) * dt);
      let moving = false;
      for (const key of channels) {
        const delta = goal[key] - value[key];
        value[key] = reduced || Math.abs(delta) < 0.002 ? goal[key] : value[key] + delta * ease;
        moving ||= value[key] !== goal[key];
      }
      quakeWeight.value = value.quakes;
      ringWeight.value = value.quakes;
      reports.opacity = reportsOpacity * value.reports;
      nightUniforms["uAuroraWeight"]!.value = value.aurora;
      return moving;
    },
  };
}
