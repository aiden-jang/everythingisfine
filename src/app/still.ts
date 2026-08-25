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
 * Fixed output, so a still does not change size with the window it was taken from - and square, because
 * the subject is a circle.
 *
 * It was 16:9, and a sphere in a 16:9 frame cannot be both large and whole: measured on the old frame the
 * globe filled **46% of the width**, with the rest dark on either side. Widening the sphere to fill that
 * would have cropped its poles. The frame was the thing in the way, so the frame changed.
 */
export const STILL_WIDTH = 1200;
export const STILL_HEIGHT = 1200;
/*
 * 118 rather than 92, for the verdict line.
 *
 * The band grew by one 26px row and the globe above it lost the same, which is the right way round: the
 * globe is 798px of an 808px frame either way, and the line is the reason anybody would share the image.
 */
const CAPTION_H = 118;

/**
 * The caption's three lines of text, in the order they are drawn.
 *
 * Separated from the drawing so it can be asserted without a canvas: what a still claims is the part
 * worth testing, and `fillText` is not.
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
 * The evidence for the title.
 *
 * This is the only artefact the app makes that gets looked at somewhere else, and it used to carry the
 * claim, a timestamp and a URL: the setup, the time, and where to buy tickets. Nothing on it said what was
 * actually happening, so the deadpan had nothing to be deadpan *about* and the image read as a title card.
 * Every number here is already in the snapshot; none of it is new work, it was simply never said.
 *
 * **Two things this refuses to say, both for reasons the app already argues elsewhere.**
 *
 * Volcanoes are left out entirely. GDACS flags none of them current and the newest episode is usually
 * weeks old, so `volcanoNote` leads with the age rather than the count precisely so a triangle cannot pass
 * as an eruption. A poster stamped with a timestamp is the worst possible place to imply currency, and
 * "16 volcanoes" beside "Live" would do exactly that. Every number on this line is a right-now number.
 *
 * Fires take a `+` when the feed is capped. The wildfire feed stops at 100 and one country alone can fill
 * it, so a flat "100 fires" would be the app stating a floor as a total on the one surface where nothing
 * is around to correct it.
 */
export function verdictLine(n: {
  quakes: number;
  cyclones: number;
  fires: number;
  firesCapped: boolean;
  floods: number;
}): string | null {
  const plural = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (n.quakes > 0) parts.push(plural(n.quakes, "earthquake"));
  if (n.cyclones > 0) parts.push(plural(n.cyclones, "cyclone"));
  // The floor marker goes on the number, not in a caveat: there is no room for a caveat here.
  if (n.fires > 0) {
    parts.push(`${n.fires}${n.firesCapped ? "+" : ""} fire${n.fires === 1 ? "" : "s"}`);
  }
  if (n.floods > 0) parts.push(plural(n.floods, "flood"));
  // Nothing at all is a real state, and an empty line is better than the word "nothing" on a poster.
  if (parts.length === 0) return null;
  return `${parts.join(". ")}.`;
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

  /*
   * Cropped to the frame, not letterboxed into it.
   *
   * What is being scaled is the whole app canvas, and the globe sits in the middle of it with dark to
   * spare - so fitting the canvas fitted its margins too and then added more. Taking a centred window of
   * the canvas at the frame's own shape throws away the emptiness instead of paying to keep it, which is
   * the whole of the gain here: the same sphere goes from 46% of the width to about 85%.
   *
   * Never cropped below the shorter side of the canvas, because that is the most the globe can span: the
   * sphere is centred and fits the smaller dimension, so a window at least that big on both axes cannot
   * clip it. A portrait canvas - a phone - cannot satisfy that at this frame's shape, and there the old
   * behaviour is right, so it falls back to fitting rather than cutting the poles off a phone's still.
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
  /*
   * The verdict in ink rather than faint, and directly under the title.
   *
   * It is the half of the joke the image was missing, so it gets the weight the claim gets. The stamp and
   * the provenance stay faint underneath: they are what the picture is of, not what it says.
   */
  ctx.font = "16px ui-monospace, SFMono-Regular, Menlo, monospace";
  if (verdict !== null) ctx.fillText(verdict, 56, baseline + 27);
  ctx.font = "15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = theme.faint;
  ctx.fillText(moment, 56, baseline + 54);
  const width = ctx.measureText(provenance).width;
  ctx.fillText(provenance, STILL_WIDTH - 56 - width, baseline + 54);

  /*
   * The scale travels with the picture, because the picture is the part that leaves.
   *
   * Every colour in a still means a magnitude and nothing in the file said so. Inside the app the key is
   * always a glance away; shared, the image was a field of coloured dots with a caption that counted them
   * and never explained them - the one place this app's own rule, that nothing ships without the sentence
   * explaining it, was not kept. And it was not for want of room: the sphere is a circle in a 16:9 frame,
   * so nearly half the width is empty either side of it.
   *
   * Eight stops rather than a two-colour gradient, because both ramps bend: `thermal` turns through red
   * and orange and `cividis` through a desaturated middle, and interpolating end to end would print a
   * key that does not match the marks above it.
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
