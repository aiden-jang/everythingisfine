/*
 * Seismic wave speeds, and the one number that decides how they are played back.
 *
 * Split out of `globe/rings.ts` because these are facts about rock rather than about rendering, and that
 * module imports three. Importing them from the ring layer dragged the whole of three.js into the eager
 * bundle for the sake of two floats.
 */

/** P-wave through continental crust. The number the ring rate and every arrival time derive from. */
export const P_WAVE_KM_PER_S = 6;

/**
 * S-wave through the same crust, and the reason there are two rings and two arrival times. The gap between
 * a P and an S arrival is how distance to an epicentre is measured. 3.5 against 6 is the ordinary crustal
 * ratio, near the root three an elastic solid with a Poisson ratio of a quarter gives.
 */
export const S_WAVE_KM_PER_S = 3.5;

/** How far behind the P front the S front sits, as a fraction. Derived, never typed in: writing 0.583
 * directly is how it survives a change to either velocity without anyone noticing. */
export const S_OVER_P = S_WAVE_KM_PER_S / P_WAVE_KM_PER_S;

/**
 * Playback multiplier for the wavefronts, printed on screen rather than hidden.
 *
 * At true rate a front advances 0.16 pixels per second on a 400px globe, which reads as a still image. Real
 * rate would have been honest and useless at once; stating the multiplier keeps both.
 *
 * Here rather than beside the ring layer, because the legend prints it and has no business importing a
 * renderer.
 */
export const PLAYBACK = 20;
