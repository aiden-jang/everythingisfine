import { MAG_MAX, MAG_MIN } from "../globe/ramp";

/* One earthquake, one tone. Not a recording - real ground motion is below hearing, so this is a
   transposition. See ARCHITECTURE.md#srcappsoundts. */

/** Two octaves, high for the smallest event and low for the largest. */
const HIGH_HZ = 440;
const LOW_HZ = 110;

/** How far up the magnitude scale an event sits, clamped to the ramp's own ends. */
function position(magnitude: number): number {
  const t = (magnitude - MAG_MIN) / (MAG_MAX - MAG_MIN);
  return Math.max(0, Math.min(1, t));
}

/** Hz for a magnitude. Lower for larger, and geometric because pitch is perceived logarithmically:
 * interpolating linearly spends most of the audible range on the top half of the magnitude scale, where
 * almost no events are. */
export function toneHz(magnitude: number): number {
  return HIGH_HZ * (LOW_HZ / HIGH_HZ) ** position(magnitude);
}

/** Seconds. A bigger rupture lasts longer, and this is the one place that is nearly literal. */
export function toneSeconds(magnitude: number): number {
  return 0.18 + position(magnitude) * 0.72;
}

/** Peak gain, compressed on purpose. Energy goes as `10^1.5M`, so a faithful mapping makes one event
 * inaudible and the next one damaging. The legend states that loudness is not energy. */
export function toneGain(magnitude: number): number {
  return 0.04 + position(magnitude) * 0.16;
}

/** Voices at once. A swarm can deliver a dozen arrivals in one poll and a dozen tones is a noise. */
export const MAX_VOICES = 3;

export interface Siren {
  play: (magnitudes: readonly number[]) => void;
  close: () => void;
}

/** Loudest first, capped. The cap exists so a swarm does not become a chord, and a swarm's largest event
 * is the one worth hearing. */
export function chooseVoices(magnitudes: readonly number[], max: number = MAX_VOICES): number[] {
  return [...magnitudes].sort((a, b) => b - a).slice(0, max);
}

/** A Web Audio siren, created on the gesture that switches it on. An `AudioContext` made before a user
 * gesture starts suspended and drops every later sound silently: the toggle looks on and nothing is heard. */
export function createSiren(Ctx: typeof AudioContext = AudioContext): Siren {
  const ctx = new Ctx();
  return {
    play: (magnitudes) => {
      // Nothing from a background tab. A tab making noise while somebody is elsewhere is a bug.
      if (typeof document !== "undefined" && document.hidden) return;
      if (ctx.state === "suspended") void ctx.resume();
      for (const magnitude of chooseVoices(magnitudes)) {
        const at = ctx.currentTime;
        const seconds = toneSeconds(magnitude);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        // Sine, because anything with harmonics reads as an alert and this is not one.
        osc.type = "sine";
        osc.frequency.value = toneHz(magnitude);
        // A short attack and an exponential tail, which is the shape of a struck thing. A square envelope
        // clicks at both ends, and the click is louder than the tone.
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(toneGain(magnitude), at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + seconds + 0.02);
      }
    },
    close: () => {
      void ctx.close();
    },
  };
}
