export function surveyComparison(left: HTMLImageElement, right: HTMLImageElement) {
  const surface = document.createElement("canvas");
  const { naturalWidth: width, naturalHeight: height } = right;
  surface.width = width;
  surface.height = height * 2;
  const context = surface.getContext("2d");
  context?.drawImage(left, 0, 0, width, height);
  context?.drawImage(right, 0, height);
  return surface;
}
