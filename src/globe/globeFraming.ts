import type { PerspectiveCamera } from "three";

function skyBleed(element: HTMLElement): number {
  const percent = Number(getComputedStyle(element).getPropertyValue("--landing-sky-bleed"));
  return (percent * document.documentElement.clientWidth) / 100 || 0;
}

export function fitGlobeCamera(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): { limiting: number; bleed: number } {
  const bleed = Math.min(width - 1, skyBleed(canvas));
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  return { limiting: Math.min(1, (width - bleed) / height), bleed };
}

export function globeFramingRect(element: HTMLElement): DOMRect {
  const rect = element.getBoundingClientRect();
  const bleed = element.clientWidth ? (skyBleed(element) * rect.width) / element.clientWidth : 0;
  return bleed ? new DOMRect(rect.x + bleed, rect.y, rect.width - bleed, rect.height) : rect;
}
