import { Mesh, MeshBasicMaterial, SphereGeometry, SRGBColorSpace, Texture } from "three";
import { DEG } from "../geo/sphere";
import { RADAR_BOUNDS } from "../sources/radar";

export function createRadarSurface() {
  const [west, south, east, north] = RADAR_BOUNDS;
  const geometry = new SphereGeometry(
    1.008,
    32,
    16,
    (west + 90) * DEG,
    (east - west) * DEG,
    (90 - north) * DEG,
    (north - south) * DEG,
  );
  const material = new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  const object = new Mesh(geometry, material);
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
