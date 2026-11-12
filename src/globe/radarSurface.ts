import { DoubleSide, Mesh, MeshBasicMaterial, SRGBColorSpace, Texture } from "three";
import { GLOBAL_RADAR_BOUNDS, radarMercatorY } from "../sources/rainviewer";
import { RADAR_BOUNDS } from "../sources/radar";
import { morphable } from "./morph";
import { rasterGeometry } from "./observationLayer";

export function createRadarSurface(morph: { value: number }) {
  const geometry = rasterGeometry(RADAR_BOUNDS);
  let worldwide = false;
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

  function setImage(image: ImageBitmap | null, global = false) {
    if (global !== worldwide) {
      object.geometry.dispose();
      object.geometry = rasterGeometry(global ? GLOBAL_RADAR_BOUNDS : RADAR_BOUNDS);
      if (global) {
        const uv = object.geometry.getAttribute("uv");
        const coordinates = object.geometry.getAttribute("aLonLat");
        for (let i = 0; i < uv.count; i++)
          uv.setY(i, Math.max(0, Math.min(1, 1 - radarMercatorY(coordinates.getY(i)))));
      }
      worldwide = global;
    }
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
