// Keep the CSS --sheet-min/--sheet-default fallbacks aligned with these viewport bounds.
export function sheetStops(height: number): [number, number, number] {
  return [
    Math.round(Math.max(height * 0.2, Math.min(180, height * 0.6))),
    Math.round(Math.max(height * 0.43, Math.min(280, height * 0.72))),
    Math.round(height * 0.82),
  ];
}
