// Integrate slow frames too; cap long tab pauses before the spring's fixed-step loop.
export function animationDelta(seconds: number): number {
  return Math.max(0, Math.min(seconds, 0.25));
}
