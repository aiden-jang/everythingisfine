/*
 * What an earthquake is, once two feeds have both had a go at describing it.
 *
 * The shape here is the whole reason the $0 constraint turned out well. With one source an event
 * would be a flat record. With two overlapping sources it cannot be, because they disagree: USGS
 * and EMSC report the same rupture minutes apart, under different identifiers, on different
 * magnitude scales, from epicentres tens of kilometres apart. A single flattened record forces a
 * winner to be picked at parse time and throws the disagreement away, and the disagreement is the
 * most interesting thing on the screen.
 *
 * So a Reading is what one agency said, and a Quake is the ground moving. Nothing collapses the two.
 */

export type SourceId = "usgs" | "emsc";

/** One agency's account of one earthquake. */
/**
 * What an agency said before it changed its mind, attached by the store.
 *
 * Early magnitudes are automatic and get reviewed: an initial M6.1 becoming M6.4 an hour later is
 * ordinary, not an error. The store used to replace a reading outright, which meant the number on
 * screen silently changed and the marker silently resized, and the app said nothing. DESIGN.md
 * already requires a magnitude to carry its scale because a bare number implies a precision that
 * does not exist; a revised number with no history implies a certainty that does not exist either.
 *
 * Three fields rather than a trail. The store is bounded at fifty thousand events and the reason
 * revisions replace instead of appending is that a busy event updated all afternoon would grow an
 * unbounded array inside it. What somebody actually wants to know is what the agency first said,
 * what it says now, and whether this has been going on: the middle of the trail answers none of
 * those.
 */
export interface Revision {
  /** The magnitude in this agency's first reading of the event. */
  fromMagnitude: number;
  /**
   * The depth in kilometres in this agency's first reading, or null when it never gave one.
   *
   * Tracked alongside magnitude rather than instead of it, because it changes what the earthquake is
   * to anyone downstream: a 40km event reassessed to 10km moves from a slab to the crust, and shallow
   * is where the damage happens. It was left out of the first version to get one thing tracked
   * honestly rather than four vaguely, and that reason expired once the mechanism existed.
   */
  fromDepthKm: number | null;
  /** How many times this agency has changed its own magnitude or depth. Never counts a re-poll. */
  count: number;
  /** When the most recent change arrived. */
  at: number;
}

export interface Reading {
  source: SourceId;
  /** The agency's own identifier. Unique within that source, meaningless across sources. */
  id: string;
  magnitude: number;
  /**
   * Which magnitude scale, verbatim: `Mww`, `mb`, `ml`, `mwc`.
   *
   * Never dropped and never normalised away. The two feeds routinely differ by a couple of tenths
   * because they are not measuring the same quantity, and a bare number implies a precision and an
   * agreement that do not exist. DESIGN.md section 10 requires it on screen for the same reason.
   */
  scale: string;
  lon: number;
  lat: number;
  /** Kilometres below the surface. Positive downward. */
  depthKm: number;
  /** Origin time: when the ground moved, epoch ms. An estimate produced by the agency. */
  time: number;
  /** Free text from the agency, already human-readable. */
  place: string;
  /**
   * What the agency says this was: `earthquake`, `quarry blast`, `explosion`, `ice quake`.
   *
   * Carried rather than filtered out. USGS's hourly feed is a seismic feed, not an earthquake feed,
   * and a quarry blast is a real thing a seismometer recorded. Dropping them loses data; drawing
   * them without saying so labels a mine as an earthquake, which is the kind of quiet
   * mislabelling DESIGN.md section 10 exists to prevent. Kept, and named on screen.
   */
  kind: string;
  /**
   * How many people told the agency they felt it, and how hard, when anybody did.
   *
   * **The only human number in this app**, which is otherwise a picture of physics with nobody in it.
   * A magnitude says how much the ground moved; this says how many people noticed, which is a different
   * question and often the one somebody actually means.
   *
   * **USGS only, and self-selected.** It is the "Did You Feel It" count, so it measures where people
   * live and whether they went online afterwards, not the size of the earthquake: a magnitude 7 in open
   * ocean gets nothing and a magnitude 3 under a city gets thousands. EMSC runs its own felt-report
   * system and does not put it in this feed, so an event seen by both agencies still carries at most one
   * of these. Absent rather than zero when nobody reported, because "nobody felt it" and "the agency has
   * no report" are different claims and only the second one is true.
   */
  felt?: { reports: number; intensity?: number };
  /**
   * Whether a person has checked this reading yet, when the agency says.
   *
   * The forward-looking half of the revision machinery. `revision` records that a number already moved;
   * this says a number may still move, because nobody has looked at it. An automatic solution is a
   * computer's first answer minutes after the ground stopped, and the app already draws it at full
   * confidence beside solutions that have been through a seismologist.
   *
   * **USGS only.** EMSC sends `auth` and `source_catalog` and no review state, and inferring one from a
   * catalogue name would be guessing about provenance, which is the one thing this field exists to stop.
   * The agency's own two words, kept verbatim rather than translated into a boolean, so a third value
   * arriving is absent rather than silently folded into one of these.
   */
  review?: "automatic" | "reviewed";
  /**
   * Set once this agency has revised its own magnitude or depth, absent until then.
   *
   * The epicentre is revised too and is not tracked. It moves by a few kilometres on most revisions,
   * which is not a fact worth a line of the panel, and the position on screen already shows it.
   */
  revision?: Revision;
  /**
   * When this reading reached us, epoch ms.
   *
   * Distinct from `time` and both are needed. `time` orders the world; `receivedAt` orders our
   * knowledge of it, and it is what the honest "since 21:40" window in the rail is measured against.
   */
  receivedAt: number;
}

/** One earthquake, as far as we can tell, with every account of it kept. */
export interface Quake {
  /** Ours, not an agency's. Derived from the first reading that arrived. */
  key: string;
  /**
   * Every source's account. At most one per source: a later reading from the same agency is a
   * revision and replaces its predecessor rather than accumulating beside it.
   */
  readings: Reading[];
  /** The reading the marker is drawn from. Never silently chosen: see `choosePrimary`. */
  primary: Reading;
}

export interface Filters {
  /** Inclusive floor on the primary reading's magnitude. */
  minMagnitude: number;
  /** Milliseconds back from `now`. Compared against origin time, not arrival. */
  windowMs: number;
  /** Sources whose events are shown. Empty means nothing is shown, which is a real state. */
  sources: ReadonlySet<SourceId>;
}
