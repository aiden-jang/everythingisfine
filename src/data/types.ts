/* What an earthquake is, once two agencies have both described it. See ARCHITECTURE.md. */

export type SourceId = "usgs" | "emsc";

/** What an agency said before it changed its mind, attached by the store. See ARCHITECTURE.md. */
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

/** One agency's account of one earthquake. */
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
   * How many people told the agency they felt it, and how hard. The only human number in this app. See
   * ARCHITECTURE.md.
   */
  felt?: { reports: number; intensity?: number };
  /**
   * Whether a person has checked this reading yet. `revision` records that a number already moved; this
   * says one may still move, because nobody has looked at it. See ARCHITECTURE.md.
   */
  review?: "automatic" | "reviewed";
  /**
   * The strongest shaking the agency's model thinks happened anywhere, on the same scale as `felt`. See
   * ARCHITECTURE.md.
   */
  shaking?: number;
  /** The network that actually computed this solution, when the agency names it. See ARCHITECTURE.md. */
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
