import type { GlobeProps } from "./GlobeProps";
import type { createGlobe } from "./scene";
import { RADIUS_EVENTS } from "./events";
import { placeSceneCue, sceneCueBounds } from "./sceneCueBounds";

const marksByLayer: Record<string, string> = {
  cyclones: "cyclone:",
  fires: "fire:",
  floods: "flood:",
  volcanoes: "volcano:",
};
type Example = {
  lon: number;
  lat: number;
  size: number;
  quake?: number;
  cluster?: boolean;
};

export function createLayerExample(canvas: HTMLCanvasElement, globe: ReturnType<typeof createGlobe>) {
  const { controls } = globe;
  const root = canvas.closest(".zones");
  const geometry = globe.events.object.geometry;
  const coordinates = geometry.getAttribute("aLonLat");
  const clusters = geometry.getAttribute("aCluster");
  const magnitudes = geometry.getAttribute("aMag");
  const depths = geometry.getAttribute("aSink");
  let node: HTMLElement | null = null;
  let selection: Example | null = null;
  let started = 0;
  let lastSearch = -Infinity;
  return (box: DOMRect, state: Pick<Required<GlobeProps>, "marks" | "depthSink" | "inspection">) => {
    const label = root?.querySelector<HTMLElement>("[data-layer-example]") ?? null;
    if (!label || root?.querySelector("#explorer-layers[hidden]")) {
      node?.removeAttribute("data-visible");
      return;
    }
    const now = performance.now();
    if (label !== node) {
      node = label;
      selection = null;
      lastSearch = -Infinity;
      started = now;
    }
    if (now - started > 3500 || state.inspection?.kind === "sequence") {
      node.removeAttribute("data-visible");
      return;
    }
    const layer = node.dataset["layerExample"]!;
    const bounds = sceneCueBounds(canvas, box);
    const morph = controls.morph();
    const project = ({ lon, lat, size, quake }: Example) => {
      const radius =
        quake === undefined ? 1 : RADIUS_EVENTS - (state.depthSink ? depths.getX(quake) * (1 - morph) : 0);
      const point = controls.project(lon, lat, radius, box);
      return point && bounds.fits(point, 72, size + 32, size) ? point : null;
    };
    const count = geometry.drawRange.count;
    if (!selection && now - lastSearch >= 180 && now - started < 1700) {
      lastSearch = now;
      let distance = Infinity;
      const nearest = (option: Example) => {
        const point = project(option);
        if (!point) return;
        const score = Math.hypot(point.x - bounds.centre.x, point.y - bounds.centre.y);
        if (score < distance) {
          distance = score;
          selection = option;
        }
      };
      if (layer === "earthquakes") {
        const stride = Math.max(1, Math.floor(count / 1600));
        for (let index = 0; index < count; index += stride) {
          const cluster = clusters.getX(index) > 0;
          nearest({
            lon: coordinates.getX(index),
            lat: coordinates.getY(index),
            size: globe.markerRadius(magnitudes.getX(index)) + (cluster ? 6 : 4),
            quake: index,
            cluster,
          });
        }
      } else {
        const prefix = marksByLayer[layer];
        for (const mark of state.marks) {
          if (prefix && mark.anchor && mark.id?.startsWith(prefix)) nearest({ ...mark.anchor, size: 13 });
        }
      }
      if (selection) {
        const { size, cluster } = selection as Example;
        node.style.setProperty("--cue-radius", `${Math.round(size)}px`);
        const caption = node.querySelector("[data-example-label]");
        if (cluster && caption) caption.textContent = "Earthquake cluster";
        node.setAttribute("data-picked", "");
      }
    }
    if (selection && matchesSelection(selection)) placeSceneCue(node, project(selection));
    else node.removeAttribute("data-visible");

    function matchesSelection(picked: Example) {
      const index = picked.quake;
      if (index !== undefined) {
        return (
          index < count && coordinates.getX(index) === picked.lon && coordinates.getY(index) === picked.lat
        );
      }
      return state.marks.some(
        (mark) =>
          mark.anchor?.lon === picked.lon &&
          mark.anchor.lat === picked.lat &&
          mark.id?.startsWith(marksByLayer[layer]!),
      );
    }
  };
}
