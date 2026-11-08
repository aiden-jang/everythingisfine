import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, Texture, SRGBColorSpace } from "three";
import { valley, type LunarPoint } from "../../sources/moonfall/apollo17";

const { left, right, near, far, columns, rows } = valley;
const floorKm = -2.78;
const stepX = (right - left) / columns;
const stepZ = (near - far) / rows;
const bound = (value: number, limit: number) => Math.min(limit - 1, Math.max(0, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function lunarTexture(image: HTMLImageElement) {
  const texture = new Texture(image);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function lunarTerrain(elevations: Int16Array, image: HTMLImageElement) {
  const height = (col: number, row: number) => elevations[row * columns + col]! / 1000 - floorKm;
  const positions = new Float32Array(columns * rows * 3);
  const colors = new Float32Array(positions.length);
  const uvs = new Float32Array(columns * rows * 2);
  const indices = new Uint16Array((columns - 1) * (rows - 1) * 6);
  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const point = row * columns + col;
      const u = (col + 0.5) / columns;
      const v = (row + 0.5) / rows;
      positions.set([left + u * (right - left), height(col, row), far + v * (near - far)], point * 3);
      uvs.set([u, 1 - v], point * 2);
      // The outermost samples mark the survey boundary. Dimming the margin leaves its outline quiet.
      const edge = Math.min(1, col / 12, row / 12, (columns - 1 - col) / 12, (rows - 1 - row) / 12);
      colors.fill(0.04 + 0.96 * edge, point * 3, point * 3 + 3);
      if (row < rows - 1 && col < columns - 1) {
        indices.set(
          [point, point + columns, point + 1, point + 1, point + columns, point + columns + 1],
          index,
        );
        index += 6;
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({ map: lunarTexture(image), vertexColors: true });
  return {
    object: new Mesh(geometry, material),
    at([x, z]: LunarPoint) {
      const col = bound((x - left) / stepX - 0.5, columns);
      const row = bound((z - far) / stepZ - 0.5, rows);
      const a = Math.floor(col);
      const b = Math.floor(row);
      const c = Math.ceil(col);
      const d = Math.ceil(row);
      // Follow the same triangles as the rendered grid, including their shared diagonal.
      const u = col - a;
      const v = row - b;
      const top = height(a, b);
      const bottom = height(c, d);
      const upperRight = height(c, b);
      const lowerLeft = height(a, d);
      return u + v <= 1
        ? mix(top, upperRight, u) + (lowerLeft - top) * v
        : mix(bottom, lowerLeft, 1 - u) + (upperRight - bottom) * (1 - v);
    },
  };
}
