export function downloadStill(file: File): void {
  const href = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = file.name;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // The download must start before its backing URL is released.
    setTimeout(() => URL.revokeObjectURL(href), 1_000);
  }
}
