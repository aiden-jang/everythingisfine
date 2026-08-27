/*
 * What an earthquake is, once two agencies have both described it.
 *
 * They disagree: same rupture, different identifiers, different magnitude scales, epicentres tens of
 * kilometres apart. Flattening that picks a winner at parse time and throws the disagreement away, and the
 * disagreement is the most interesting thing on screen.
 *
 * So a Reading is what one agency said and a Quake is the ground moving. Nothing collapses the two.
 */

export type SourceId = "usgs" | "emsc";

/** One agency's account of one earthquake. */
/**
 * What an agency said before it changed its mind, attached by the store.
 *
 * Early magnitudes are automatic and get reviewed: an initial M6.1 becoming M6.4 is ordinary. Replacing the
 * reading outright meant the number changed and the marker resized with nothing said.
 *
 * Three fields rather than a trail. The store is bounded at fifty thousand events, and a busy event updated
 * all afternoon would grow an unbounded array inside it. The middle of a trail answers nothing anybody asks.
 */
export interface Revision {
  /** The magnitude in this agency's first reading of the event. */
  fromMagnitude: number;
  /** The depth in this agency's first reading, or null when it never gave one. Tracked alongside magnitude
   * because it changes what the earthquake is: a 40km event reassessed to 10km moves from a slab to the
   * crust, and shallow is where the damage happens. */
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
   * Which magnitude scale, verbatim: `Mww`, `mb`, `ml`, `mwc`. Never normalised away. The two feeds routinely
   * differ by a couple of tenths because they are not measuring the same quantity, and a bare number implies
   * a precision and an agreement that do not exist.
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
   * What the agency says this was: `earthquake`, `quarry blast`, `explosion`, `ice quake`. Carried rather
   * than filtered out - a quarry blast is a real thing a seismometer recorded. Dropping them loses data;
   * drawing them without saying so labels a mine as an earthquake.
   */
  kind: string;
  /**
   * How many people told the agency they felt it, and how hard. The only human number in this app.
   *
   * USGS only, and self-selected: it measures where people live and whether they went online afterwards, so
   * a magnitude 7 in open ocean gets nothing. EMSC runs its own system and does not put it in this feed.
   *
   * Absent rather than zero when nobody reported: "nobody felt it" and "the agency has no report" are
   * different claims, and only the second is true.
   */
  felt?: { reports: number; intensity?: number };
  /**
   * Whether a person has checked this reading yet. `revision` records that a number already moved; this says
   * one may still move, because nobody has looked at it.
   *
   * USGS only. EMSC sends `auth` and `source_catalog` and no review state, and inferring one from a catalogue
   * name would be guessing about provenance. Kept as the agency's own two words rather than a boolean, so a
   * third value is absent rather than silently folded into one of these.
   */
  review?: "automatic" | "reviewed";
  /**
   * The strongest shaking the agency's model thinks happened anywhere, on the same scale as `felt`.
   *
   * `felt.intensity` is what people ticked where they were standing; this is what a model says the worst of
   * it was, whether or not anybody was there. They routinely disagree, which is why both are shown.
   *
   * A maximum, and the copy must say so, or it reads as "what it felt like". USGS only, and only on the
   * events they build a map for - about one in thirteen at M4.5.
   */
  shaking?: number;
  /**
   * The network that actually computed this solution, when the agency names it.
   *
   * Both feeds are aggregators. USGS calls this `net` and sends `hv` for the Hawaiian Volcano Observatory;
   * EMSC calls it `auth` and sends `BMKG`. Without it, a Hawaiian earthquake is credited to the relay.
   *
   * Kept as the agency's code. Expanding `hv` needs a table of seismic networks that would go stale, and the
   * app already prints `mww` verbatim for the same reason.
   */
  network?: string;
  /** Set once this agency has revised its own magnitude or depth. The epicentre is revised too and is not
   * tracked: it moves a few kilometres on most revisions, and the position on screen already shows it. */
  revision?: Revision;
  /** When this reading reached us. Distinct from `time`, and both are needed: `time` orders the world,
   * `receivedAt` orders our knowledge of it, and the rail's "since 21:40" is measured against it. */
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
