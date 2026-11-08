import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
} from "three";
import { landing, traverses, type LunarPoint } from "../../sources/moonfall/apollo17";

const routeColor = 0xf3cd95;

export function roverRoutes(height: (point: LunarPoint) => number) {
  const root = new Group();
  const trailMaterial = new LineBasicMaterial({ color: routeColor });
  const guideMaterial = new LineBasicMaterial({ color: 0x929097, transparent: true, opacity: 0.62 });
  const pinMaterial = new MeshBasicMaterial({ color: routeColor });
  const markerGeometry = new RingGeometry(0.065, 0.09, 24).rotateX(-Math.PI / 2);
  const locator = new Mesh(new SphereGeometry(0.078, 16, 10), pinMaterial);
  const home = new Mesh(markerGeometry, new MeshBasicMaterial({ color: 0xf1edf0 }));
  home.position.set(landing[0], height(landing) + 0.035, landing[1]);
  root.add(home, locator);
  const segmentPoint = (point: LunarPoint) => [point[0], height(point) + 0.035, point[1]];

  const routes = traverses.map(({ segments, stations }) => {
    const geometry = new BufferGeometry().setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array(segments.flatMap(({ from, to }) => [...segmentPoint(from), ...segmentPoint(to)])),
        3,
      ),
    );
    const played = new BufferGeometry().setAttribute("position", geometry.getAttribute("position"));
    const trail = new LineSegments(played, trailMaterial);
    const group = new Group();
    group.add(new LineSegments(geometry, guideMaterial), trail);
    const pins = stations.map(({ point }) => {
      const pin = new Mesh(markerGeometry, pinMaterial);
      pin.position.set(point[0], height(point) + 0.04, point[1]);
      group.add(pin);
      return pin;
    });
    root.add(group);
    return { group, played, segments, pins };
  });

  return {
    root,
    set(eva: number, distance: number, station: number | null) {
      for (const [i, route] of routes.entries()) route.group.visible = i === eva;
      const { segments, played, pins } = routes[eva]!;
      const selected = pins[station ?? -1];
      for (const pin of pins) pin.scale.setScalar(pin === selected ? 1.65 : 1);
      let index = segments.findIndex(({ end }) => end >= distance);
      if (index === -1) index = segments.length - 1;
      played.setDrawRange(0, (index + Number(distance >= segments[index]!.end)) * 2);
      const { from, to, start, end } = segments[index]!;
      const part = (distance - start) / (end - start);
      const point = [from[0] + (to[0] - from[0]) * part, from[1] + (to[1] - from[1]) * part] as const;
      if (selected) locator.position.copy(selected.position);
      else locator.position.set(point[0], height(point) + 0.035, point[1]);
      locator.position.y += 0.065;
      return locator.position;
    },
  };
}
