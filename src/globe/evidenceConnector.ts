import type { Controls } from "./controls";

export function positionEvidenceConnector(
  canvas: HTMLCanvasElement,
  controls: Controls,
  parents: Map<Element, DOMRect>,
) {
  const root = canvas.closest(".zones");
  const svg = root?.querySelector<SVGSVGElement>("[data-evidence-connector]");
  if (!svg) return;
  const source = root?.querySelector<HTMLElement>("[data-evidence-source=true]");
  const target = root?.querySelector<SVGCircleElement>("[data-evidence-point]");
  const point =
    source && controls.project(Number(source.dataset["lon"]), Number(source.dataset["lat"]), 1.01);
  const parent = source?.parentElement ? parents.get(source.parentElement) : undefined;
  const end = target?.getBoundingClientRect();
  const body = target?.closest("[data-evidence-body]")?.getBoundingClientRect();
  if (
    !point ||
    !parent ||
    !end ||
    !body ||
    point.x < parent.left + 24 ||
    point.x > parent.right - 24 ||
    point.y < parent.top + 55 ||
    point.y > parent.bottom - 55 ||
    end.y < body.top ||
    end.bottom > body.bottom
  ) {
    svg.style.visibility = "hidden";
    return;
  }
  svg.style.visibility = "visible";
  const x = end.x + end.width / 2,
    y = end.y + end.height / 2;
  const phone = innerWidth < 900;
  const bend = phone ? point.y + (y - point.y) * 0.45 : point.x + (x - point.x) * 0.45;
  const path = phone
    ? `M${point.x},${point.y} C${point.x},${bend} ${x},${bend} ${x},${y}`
    : `M${point.x},${point.y} C${bend},${point.y} ${bend},${y} ${x},${y}`;
  svg.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`);
  svg.querySelector("path")?.setAttribute("d", path);
  svg.querySelector("circle")?.setAttribute("cx", String(point.x));
  svg.querySelector("circle")?.setAttribute("cy", String(point.y));
}
