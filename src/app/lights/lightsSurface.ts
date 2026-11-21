export function lightsComparison(before: HTMLImageElement, after: HTMLImageElement) {
  const atlas = document.createElement("canvas");
  const height = after.naturalHeight;
  atlas.width = after.naturalWidth;
  atlas.height = height * 2;
  const context = atlas.getContext("2d");
  context?.drawImage(before, 0, 0);
  context?.drawImage(after, 0, height);
  return atlas;
}

export const lightsCities = [
  { id: "mayaguez", name: "Mayagüez", lon: -67.14, lat: 18.2 },
  { id: "ponce", name: "Ponce", lon: -66.61, lat: 18.01 },
  { id: "san-juan", name: "San Juan", lon: -66.105, lat: 18.46 },
] as const;
