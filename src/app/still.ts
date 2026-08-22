/*
 * The view as a PNG, with the moment it is of written on it.
 *
 * Item 20's state half already travels: the permalink carries the camera and the cursor, so a link says
 * where and when. This is the other half - the same view as an image, for the places a link cannot go.
 *
 * **The stamp is the whole reason this is not a screenshot.** `make-card.mjs` already learned that an
 * image of live data outlives the data: a card cached for days showed one afternoon's wildfires as if
 * they were now. A still is that problem in miniature and worse, because it is shared by hand with no
 * cache to blame. So every still says the moment it is of, and it takes that moment from **the cursor**
 * rather than from the clock - a still of a view parked two hours back is a picture of two hours ago, and
 * stamping it "now" would be the picture lying about itself.
 *
 * Composition rather than a raw canvas grab, for two reasons. The globe's own context is `alpha: true`
 * with a zero clear alpha, so a bare capture is a globe on transparency - which viewers paint black,
 * white, or a checkerboard, none of which is the design. And the chrome that explains the globe is DOM
 * sitting over the canvas, so it is not in the capture at all; the caption is the minimum that puts back
 * what a reader needs to know they are looking at.
 */

export interface StillCaption {
  /** What the image is of, from the cursor rather than the clock. */
  moment: string;
  /** The filter, so nobody reads an empty ocean as a quiet ocean. */
  filter: string;
  /** Where it came from, so the still carries its own provenance. */
  host: string;
}

export interface StillTheme {
  background: string;
  ink: string;
  faint: string;
}

/** Fixed output, so a still does not change size with the window it was taken from. */
export const STILL_WIDTH = 1600;
export const STILL_HEIGHT = 900;
const CAPTION_H = 92;

/**
 * The caption's three lines of text, in the order they are drawn.
 *
 * Separated from the drawing so it can be asserted without a canvas: what a still claims is the part
 * worth testing, and `fillText` is not.
 */
export function captionLines(caption: StillCaption): [string, string, string] {
  return ["EVERYTHING IS FINE", caption.moment, `${caption.filter} · ${caption.host}`];
}

/**
 * The moment, as the caption states it.
 *
 * "Live" only when the cursor is not holding a moment *and* the app is actually live. Anything else is
 * written as an absolute time with its date, because a still is looked at later by definition and "18
 * minutes ago" ages into a lie the instant the image is saved.
 *
 * **The archive branch exists because this said "Live" about a day in July.** The clock was made
 * archive-aware when that mode shipped, so the stamp was right and the word in front of it was a flat
 * falsehood - on the one artefact in this app designed to be looked at away from the app, where nothing
 * else is around to correct it. An archived still names the day and never the word.
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
 * Draws the still onto a 2D context.
 *
 * Takes the globe's canvas as an image source and letterboxes it: scaled to fit rather than cropped to
 * fill, because cropping a globe to a wider frame cuts the limb off and the shape of the planet is the
 * one thing every reader uses to orient themselves.
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

  const frameH = STILL_HEIGHT - CAPTION_H;
  const scale = Math.min(STILL_WIDTH / globeWidth, frameH / globeHeight);
  const w = globeWidth * scale;
  const h = globeHeight * scale;
  ctx.drawImage(globe, (STILL_WIDTH - w) / 2, (frameH - h) / 2, w, h);

  const [mark, moment, provenance] = captionLines(caption);
  const baseline = frameH + 34;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = theme.ink;
  ctx.font = "600 21px Geist, Helvetica Neue, Arial, sans-serif";
  ctx.letterSpacing = "0.16em";
  ctx.fillText(mark, 56, baseline);
  ctx.letterSpacing = "0px";
  ctx.font = "15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = theme.faint;
  ctx.fillText(moment, 56, baseline + 26);
  const width = ctx.measureText(provenance).width;
  ctx.fillText(provenance, STILL_WIDTH - 56 - width, baseline + 26);
}
