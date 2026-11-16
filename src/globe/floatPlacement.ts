export function updateFloatTether(marker = document.querySelector<HTMLElement>("[data-float-instrument]")) {
  if (!marker) return;
  const layer = marker.parentElement!;
  const host = layer.getBoundingClientRect();
  const circle = marker.closest(".zones")?.querySelector<SVGCircleElement>(".float-profile-sample");
  const point = circle?.getBoundingClientRect();
  const profile = circle?.closest(".float-profile")?.getBoundingClientRect();
  const svg = layer.querySelector<SVGSVGElement>(".float-tether");
  const px = Number.parseFloat(marker.style.left) || 0;
  const py = Number.parseFloat(marker.style.top) || 0;
  if (svg) {
    svg.style.opacity =
      marker.style.opacity === "1" &&
      point?.width &&
      profile &&
      point.top >= profile.top &&
      point.bottom <= profile.bottom
        ? "1"
        : "0";
    const tx = (point?.left ?? 0) + (point?.width ?? 0) / 2 - host.left;
    const ty = (point?.top ?? 0) + (point?.height ?? 0) / 2 - host.top;
    svg.setAttribute("viewBox", `0 0 ${host.width} ${host.height}`);
    svg
      .querySelector("path")
      ?.setAttribute("d", `M${px},${py} C${px + 40},${py} ${tx - 40},${ty} ${tx},${ty}`);
  }
}

export function placeFloatReading(canvas: HTMLCanvasElement, x: number, y: number, visible: boolean) {
  const marker = canvas.closest(".zones")?.querySelector<HTMLElement>("[data-float-instrument]");
  if (!marker) return;
  const box = canvas.getBoundingClientRect();
  const host = marker.parentElement!.getBoundingClientRect();
  marker.style.left = `${box.left - host.left + x * box.width}px`;
  marker.style.top = `${box.top - host.top + (1 - y) * box.height}px`;
  marker.style.opacity = visible ? "1" : "0";
  updateFloatTether(marker);
}
