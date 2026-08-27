/*
 * The view as a PNG, with the moment it is of written on it.
 *
 * Always stamp the moment, and take it from the cursor rather than the clock. An image of live data outlives
 * the data, and a still is shared by hand with no cache to blame.
 *
 * Compose it; never grab the canvas raw. The globe's context has a zero clear alpha, so a bare capture is a
 * globe on transparency, and the chrome that explains it is DOM sitting over the canvas.
 */

import { MAG_MAX, MAG_MIN, rampColorAt, type RampName } from "../globe/ramp";

export interface StillCaption {
  /** What the image is of, from the cursor rather than the clock. */
  moment: string;
  /** The evidence for the title, from `verdictLine`. Null when the planet really has nothing on it. */
  verdict: string | null;
  /** The filter, so nobody reads an empty ocean as a quiet ocean. */
  filter: string;
  /** Where it came from, so the still carries its own provenance. */
  host: string;
}

export interface StillTheme {
  background: string;
  ink: string;
  faint: string;
  /** The palette the marks were drawn in, so the still can say what its colours mean. */
  ramp: RampName;
}

/*
 * Fixed output, so a still does not change size with the window - and square, because the subject is a
 * circle. At 16:9 the globe filled 46% of the width, and widening the sphere to fill it would have cropped
 * the poles. The frame was the thing in the way.
 */
export const STILL_WIDTH = 1200;
export const STILL_HEIGHT = 1200;
/*
 * 118 rather than 92, for the verdict line. The globe is 798px of an 808px frame either way, and the line
 * is the reason anybody would share the image.
 */
const CAPTION_H = 118;

/**
 * The caption's three lines of text, in the order they are drawn. Separated from the drawing so it can be
 * asserted without a canvas: what a still claims is the part worth testing, and `fillText` is not.
 */
export function captionLines(
  caption: StillCaption,
): [string, string | null, string, string] {
  return [
    "EVERYTHING IS FINE",
    caption.verdict,
    caption.moment,
    `${caption.filter} · ${caption.host}`,
  ];
}

/**
 * The evidence line under the title. Every number is already in the snapshot.
 *
 * No volcanoes. GDACS flags none of them current, so a count beside "Live" would imply they are erupting.
 *
 * Fires take a `+` when the feed is capped at 100, because one country can fill it and a flat "100 fires"
 * would state a floor as a total.
 */
export function verdictLine(n: {
  quakes: number;
  cyclones: number;
  fires: number;
  firesCapped: boolean;
  floods: number;
}): string | null {
  // Grouped, because a poster is read rather than glanced at. A busy day printed "6000 earthquakes" while
  // every figure in the rail beside it read "6,000".
  const group = (count: number): string => count.toLocaleString("en-GB");
  const plural = (count: number, word: string): string =>
    `${group(count)} ${word}${count === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (n.quakes > 0) parts.push(plural(n.quakes, "earthquake"));
  if (n.cyclones > 0) parts.push(plural(n.cyclones, "cyclone"));
  // The floor marker goes on the number, not in a caveat: there is no room for a caveat here.
  if (n.fires > 0) {
    parts.push(`${group(n.fires)}${n.firesCapped ? "+" : ""} fire${n.fires === 1 ? "" : "s"}`);
  }
  if (n.floods > 0) parts.push(plural(n.floods, "flood"));
  // Nothing at all is a real state, and an empty line is better than the word "nothing" on a poster.
  if (parts.length === 0) return null;
  return `${parts.join(". ")}.`;
}

/**
 * The moment, as the caption states it.
 *
 * "Live" only when the cursor is not holding a moment and the app is actually live. Anything else is an
 * absolute time with its date, because a still is looked at later by definition and "18 minutes ago" ages
 * into a lie the instant the image is saved.
 *
 * The archive branch exists because this said "Live" about a day in July. An archived still names the day.
 */
export function stillMoment(
  cursor: number | null, now: number, archived = false, live = "Live",
): string {
  const at = cursor ?? now;
  const iso = new Date(at).toISOString();
  const stamp = `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
  // A held moment already names its own time, so it needs no word either way.
  if (cursor !== null) return `Held at ${stamp}`;
  return archived ? `Archived day · ${iso.slice(0, 10)}` : `${live} · ${stamp}`;
}

/**
 * Draws the still onto a 2D context. Scaled to fit rather than cropped to fill, because cropping a globe
 * cuts the limb off and the shape of the planet is what every reader uses to orient themselves.
 */
export function drawStill(
  ctx: CanvasRenderingContext2D,
  globe: CanvasImageSource,
  globeWidth: number,
  globeHeight: number,
  caption: StillCaption,
  theme: StillTheme,
): void {
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, STILL_WIDTH, STILL_HEIGHT);

  /*
   * Cropped to the frame, not letterboxed into it. What is scaled is the whole app canvas, with the globe
   * in the middle and dark to spare, so fitting it fitted its margins too: the same sphere goes from 46% of
   * the width to about 85%.
   *
   * Never cropped below the shorter side of the canvas, because that is the most the globe can span. A
   * portrait canvas cannot satisfy that at this frame's shape, so it falls back to fitting rather than
   * cutting the poles off a phone's still.
   */
  const frameH = STILL_HEIGHT - CAPTION_H;
  const frameAspect = STILL_WIDTH / frameH;
  const shortest = Math.min(globeWidth, globeHeight);
  let sw = globeWidth;
  let sh = globeHeight;
  if (globeWidth / globeHeight > frameAspect) sw = globeHeight * frameAspect;
  else sh = globeWidth / frameAspect;

  if (sw >= shortest && sh >= shortest) {
    ctx.drawImage(globe, (globeWidth - sw) / 2, (globeHeight - sh) / 2, sw, sh, 0, 0, STILL_WIDTH, frameH);
  } else {
    const scale = Math.min(STILL_WIDTH / globeWidth, frameH / globeHeight);
    const w = globeWidth * scale;
    const h = globeHeight * scale;
    ctx.drawImage(globe, (STILL_WIDTH - w) / 2, (frameH - h) / 2, w, h);
  }

  const [mark, verdict, moment, provenance] = captionLines(caption);
  const baseline = frameH + 34;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = theme.ink;
  ctx.font = "600 21px Geist, Helvetica Neue, Arial, sans-serif";
  ctx.letterSpacing = "0.16em";
  ctx.fillText(mark, 56, baseline);
  ctx.letterSpacing = "0px";
  // The verdict in ink rather than faint, directly under the title: it is the half of the joke the image was
  // missing. The stamp and the provenance stay faint - they are what the picture is of, not what it says.
  ctx.font = "16px ui-monospace, SFMono-Regular, Menlo, monospace";
  if (verdict !== null) ctx.fillText(verdict, 56, baseline + 27);
  ctx.font = "15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = theme.faint;
  ctx.fillText(moment, 56, baseline + 54);
  const width = ctx.measureText(provenance).width;
  ctx.fillText(provenance, STILL_WIDTH - 56 - width, baseline + 54);

  /*
   * The scale travels with the picture, because the picture is the part that leaves. Shared, the image was a
   * field of coloured dots with a caption that counted them and never explained them.
   *
   * Eight stops rather than a two-colour gradient, because both ramps bend: `thermal` turns through red and
   * orange and `cividis` through a desaturated middle, so interpolating end to end prints a key that does
   * not match the marks above it.
   */
  const scaleW = 190;
  const scaleRight = STILL_WIDTH - 56;
  const scaleLeft = scaleRight - scaleW;
  const scaleTop = baseline + 2;
  ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, monospace";
  const label = "magnitude";
  ctx.fillText(label, scaleRight - ctx.measureText(label).width, baseline - 10);
  const grad = ctx.createLinearGradient(scaleLeft, 0, scaleRight, 0);
  for (let i = 0; i <= 8; i += 1) grad.addColorStop(i / 8, rampColorAt(theme.ramp, i / 8));
  ctx.fillStyle = grad;
  ctx.fillRect(scaleLeft, scaleTop, scaleW, 8);
  ctx.fillStyle = theme.faint;
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`${MAG_MIN.toFixed(1)}`, scaleLeft, scaleTop + 24);
  const top = `${MAG_MAX.toFixed(1)}+`;
  ctx.fillText(top, scaleRight - ctx.measureText(top).width, scaleTop + 24);
}
