import type { ArgoSample } from "../../sources/argo";

export type ProfileField = "temperature" | "salinity";

export const PROFILE_CHART = { width: 310, height: 216, left: 54, right: 278, top: 24, bottom: 166 };

function profileTrend(samples: readonly ArgoSample[], field: ProfileField, min: number, max: number) {
  const deep = samples[0]!;
  const shallow = samples.at(-1)!;
  const digits = field === "temperature" ? 2 : 3;
  if (min.toFixed(digits) === max.toFixed(digits))
    return field === "temperature"
      ? `Temperature stays near ${min.toFixed(digits)} °C across the measured depths.`
      : `Practical salinity stays near ${min.toFixed(digits)} across the measured depths.`;
  const same = shallow[field].toFixed(digits) === deep[field].toFixed(digits);
  const comparison = same
    ? field === "temperature"
      ? "about as warm as"
      : "about as salty as"
    : shallow[field] > deep[field]
      ? field === "temperature"
        ? "warmer than"
        : "saltier than"
      : field === "temperature"
        ? "colder than"
        : "less salty than";
  const interior = max > Math.max(deep[field], shallow[field]);
  return `The shallowest sample is ${comparison} the deepest.${
    interior ? ` The ${field === "temperature" ? "warmest" : "saltiest"} water lies between them.` : ""
  }`;
}

export function profileGeometry(samples: readonly ArgoSample[], field: ProfileField) {
  const { left, right, top, bottom } = PROFILE_CHART;
  const values = samples.map((sample) => sample[field]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.08, field === "temperature" ? 0.01 : 0.001);
  const low = min - padding;
  const high = max + padding;
  const deepest = Math.max(...samples.map((sample) => sample.depth));
  const points = samples.map((sample) => ({
    x: left + ((sample[field] - low) / (high - low)) * (right - left),
    y: top + (sample.depth / Math.max(1, deepest)) * (bottom - top),
  }));
  return {
    low,
    high,
    deepest,
    min,
    max,
    points,
    line: points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
    trend: profileTrend(samples, field, min, max),
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
  const heading = `The shallowest sample was ${comparison} the deepest one.`;
  const reading = `${shallow.temperature.toFixed(2)}\u00a0°C at ${Math.round(shallow.depth).toLocaleString()}\u00a0m, compared with ${deep.temperature.toFixed(2)}\u00a0°C at ${Math.round(deep.depth).toLocaleString()}\u00a0m.`;
  const maximum = Math.max(...samples.map((sample) => sample.temperature));
  const warmest = samples.flatMap((sample, index) => (sample.temperature === maximum ? [index] : []));
  const interior = maximum > Math.max(deep.temperature, shallow.temperature);
  const index = interior ? warmest.at(-1)! : shallow.temperature === maximum ? samples.length - 1 : 0;
  const peak = samples[index]!;
  const finding = interior
    ? {
        heading:
          warmest.length === 1
            ? "The warmest water was below the surface."
            : "The warmest samples were below the surface.",
        reading: `${peak.temperature.toFixed(2)}\u00a0°C at ${Math.round(peak.depth).toLocaleString()}\u00a0m${warmest.length > 1 ? `, one of ${warmest.length} samples at the same maximum` : ""}; the shallowest sample was ${shallow.temperature.toFixed(2)}\u00a0°C at ${Math.round(shallow.depth).toLocaleString()}\u00a0m.`,
        index,
      }
    : { heading, reading, index };
  return { heading, reading, finding };
}
