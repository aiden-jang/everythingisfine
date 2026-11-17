import type { TonightView } from "../../geo/tonight";

export function skyTargets(bodies: TonightView["bodies"]) {
  const visible = bodies
    .filter((body) => body.altitude > 0)
    .sort((a, b) => a.magnitude - b.magnitude || b.altitude - a.altitude);
  const target = visible.find((body) => body.altitude > 5) ?? visible[0];
  return {
    target,
    visible: target ? [target, ...visible.filter((body) => body !== target)] : visible,
    below: bodies.filter((body) => body.altitude <= 0),
  };
}

export function skyDirection(azimuth: number) {
  return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][
    Math.round(azimuth / 45) % 8
  ]!;
}
