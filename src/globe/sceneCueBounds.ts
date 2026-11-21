type Point = { x: number; y: number };

export function placeSceneCue(node: HTMLElement, point: Point | null) {
  const parent = node.offsetParent as HTMLElement | null;
  const box = point && parent?.getBoundingClientRect();
  const visible = !!(box && box.width && box.height);
  node.toggleAttribute("data-visible", visible);
  if (visible && point && parent) {
    const x = ((point.x - box.left) / box.width) * parent.offsetWidth;
    const y = ((point.y - box.top) / box.height) * parent.offsetHeight;
    node.style.transform = `translate(${x}px, ${y}px)`;
  }
  return visible;
}

export function sceneCueBounds(canvas: HTMLCanvasElement, box: DOMRect, landing = false) {
  const frame = canvas.closest(".frame");
  const header = frame?.querySelector(".zone-head")?.getBoundingClientRect();
  const rail = frame?.querySelector("#chrome-rail:not([hidden])")?.getBoundingClientRect();
  const top = Math.max(box.top, header?.bottom ?? 0, 0) + 12;
  let left = Math.max(box.left, 0) + 8;
  const right = Math.min(box.right, innerWidth) - 8;
  let bottom = Math.min(box.bottom, innerHeight) - 20;
  if (rail?.width && rail.height) {
    if (rail.right < innerWidth * 0.65) left = Math.max(left, rail.right + 12);
    else if (rail.top >= top) bottom = Math.min(bottom, rail.top - 38);
  }
  if (landing && (innerWidth >= 900 || (innerWidth >= 600 && innerHeight <= 620))) {
    left = Math.max(left, innerWidth * 0.42);
  }
  return {
    bottom,
    centre: { x: (left + right) / 2, y: top + (bottom - top) * 0.46 },
    fits(point: Point, halfWidth: number, above: number, below: number) {
      return (
        point.x >= left + halfWidth &&
        point.x <= right - halfWidth &&
        point.y >= top + above &&
        point.y <= bottom - below
      );
    },
  };
}
