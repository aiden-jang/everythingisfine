// Keep the CSS --sheet-min/--sheet-default fallbacks aligned with these viewport bounds.
export function sheetStops(height: number): [number, number, number] {
  return [
    Math.round(Math.max(height * 0.28, Math.min(220, height * 0.6))),
    Math.round(Math.max(height * 0.46, Math.min(280, height * 0.72))),
    Math.round(height * 0.82),
  ];
}
