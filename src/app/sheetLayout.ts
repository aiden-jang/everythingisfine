// Reserve the fixed footer without collapsing the globe to zero on short screens.
export function sheetStops(height: number, stories = false, reserved = 0): [number, number, number] {
  const base = [
    Math.round(Math.max(height * 0.2, Math.min(180, height * 0.6))),
    Math.round(
      stories
        ? Math.max(height * 0.34, Math.min(240, height * 0.65))
        : Math.max(height * 0.43, Math.min(280, height * 0.72)),
    ),
    Math.round(height * 0.82),
  ];
  const first = Math.max(Math.min(150, height * 0.4), base[0]! - reserved);
  const last = Math.max(first, base[2]! - reserved);
  return [
    Math.round(first),
    Math.round(Math.min(last, Math.max(first, base[1]! - reserved))),
    Math.round(last),
  ];
}
