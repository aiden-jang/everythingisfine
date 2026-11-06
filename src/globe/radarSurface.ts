import { DoubleSide, Mesh, MeshBasicMaterial, SRGBColorSpace, Texture } from "three";
import { RADAR_BOUNDS } from "../sources/radar";
import { morphable } from "./morph";
import { rasterGeometry } from "./observationLayer";

export function createRadarSurface(morph: { value: number }) {
  const geometry = rasterGeometry(RADAR_BOUNDS);
  const material = new MeshBasicMaterial({
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  morphable(material, morph);
  const object = new Mesh(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 4.5;
  object.visible = false;

  function setImage(image: ImageBitmap | null) {
    if ((material.map?.image ?? null) === image) return;
    material.map?.dispose();
    material.map = image ? new Texture(image) : null;
    if (material.map) {
      // ImageBitmap uploads keep the PNG's northern row first, independently of Texture.flipY.
      material.map.flipY = false;
      material.map.repeat.y = -1;
      material.map.offset.y = 1;
      material.map.colorSpace = SRGBColorSpace;
      material.map.needsUpdate = true;
    }
    object.visible = image !== null;
    material.needsUpdate = true;
  }

  return { object, setImage };
}
