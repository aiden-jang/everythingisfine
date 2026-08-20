/*
 * Seismic wave speeds, and the one number that decides how they are played back.
 *
 * Split out of `globe/rings.ts` because these are facts about rock rather than about rendering, and
 * because that module imports three. The panel and the legend both need them and neither needs a
 * renderer: importing them from the ring layer dragged the whole of three.js into the eager bundle for
 * the sake of two floats, behind a canvas that is deliberately `lazy`.
 *
 * The legend previously took the multiplier as a prop to dodge exactly that, which worked and was a
 * workaround for a file boundary in the wrong place. This is the boundary in the right place.
 */

/** P-wave through continental crust. The number the ring rate and every arrival time derive from. */
export const P_WAVE_KM_PER_S = 6;

/**
 * S-wave through the same crust, and the reason there are two rings and two arrival times.
 *
 * The gap between a P arrival and an S arrival is how distance to an epicentre is measured: it is the
 * first thing a seismogram is read for. 3.5 against 6 is the ordinary crustal ratio, near the root
 * three that an elastic solid with a Poisson ratio of a quarter gives, so it is the textbook figure
 * rather than a tuned one.
 */
export const S_WAVE_KM_PER_S = 3.5;

/**
 * How far behind the P front the S front sits, as a fraction. Derived, never typed in.
 *
 * Writing 0.583 directly is how it survives a change to either velocity without anyone noticing.
 */
export const S_OVER_P = S_WAVE_KM_PER_S / P_WAVE_KM_PER_S;

/**
 * Playback multiplier for the wavefronts, printed on screen rather than hidden.
 *
 * At true rate a front advances 0.054 degrees a second, which on a 400px globe is **0.16 pixels per
 * second**. A mock built at true rate proved it reads as a still image, and an imperceptible wavefront
 * fails the requirement that the first frame after load has a ring expanding. Real rate would have been
 * honest and useless at once. Stating the multiplier keeps both.
 *
 * Here rather than beside the ring layer because the legend prints it, and the legend has no business
 * importing a renderer.
 */
export const PLAYBACK = 20;
