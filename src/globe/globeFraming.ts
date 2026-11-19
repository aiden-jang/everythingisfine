import type { PerspectiveCamera } from "three";
import { visibleCopies } from "./morph";

function sceneBleed(element: HTMLElement): number {
  const style = getComputedStyle(element);
  const landing = Number(style.getPropertyValue("--landing-sky-bleed"));
  const explore = parseFloat(style.getPropertyValue("--explore-scene-bleed"));
  return explore || (landing * document.documentElement.clientWidth) / 100 || 0;
}

export function fitGlobeCamera(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): { limiting: number; bleed: number } {
  const bleed = Math.min(width - 1, sceneBleed(canvas));
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  return { limiting: Math.min(1, (width - bleed) / height), bleed };
}

export function globeFramingRect(element: HTMLElement): DOMRect {
  const rect = element.getBoundingClientRect();
  const bleed = element.clientWidth ? (sceneBleed(element) * rect.width) / element.clientWidth : 0;
  return bleed ? new DOMRect(rect.x + bleed, rect.y, rect.width - bleed, rect.height) : rect;
}

export function visibleMapCopies(camera: PerspectiveCamera, period: number) {
  const matrix = camera.projectionMatrix.elements;
  const halfWidth = camera.position.z / matrix[0]!;
  // The left bleed moves the edge of the frustum without moving the camera position.
  return visibleCopies(camera.position.x + halfWidth * matrix[8]!, halfWidth, period);
}
