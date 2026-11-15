import type { ArgoSample } from "../../sources/argo";

export type ProfileField = "temperature" | "salinity";

export function profileGeometry(samples: readonly ArgoSample[], field: ProfileField) {
  const values = samples.map((sample) => sample[field]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.08, field === "temperature" ? 0.01 : 0.001);
  const low = min - padding;
  const high = max + padding;
  const deepest = Math.max(...samples.map((sample) => sample.depth));
  const points = samples.map((sample) => ({
    x: 54 + ((sample[field] - low) / (high - low)) * 224,
    y: 24 + (sample.depth / Math.max(1, deepest)) * 142,
  }));
  return {
    low,
    high,
    deepest,
    min,
    max,
    points,
    line: points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
  };
}

export function profileTakeaway(samples: readonly ArgoSample[]) {
  const deep = samples[0]!;
  const shallow = samples.at(-1)!;
  const comparison =
    shallow.temperature.toFixed(2) === deep.temperature.toFixed(2)
      ? "about as warm as"
      : shallow.temperature > deep.temperature
        ? "warmer than"
        : "colder than";
  return {
    heading: `The shallowest sample was ${comparison} the deepest one.`,
    reading: `${shallow.temperature.toFixed(2)} °C at ${Math.round(shallow.depth).toLocaleString()} m, compared with ${deep.temperature.toFixed(2)} °C at ${Math.round(deep.depth).toLocaleString()} m.`,
  };
}
