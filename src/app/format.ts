import type { Quake, Reading, SourceId } from "../data/types";

/*
 * Turning data into words, under DESIGN.md section 10.
 *
 * Every function here exists because the obvious formatting would have been a small lie.
 */

/** `M 5.2 (Mww)`. Never a bare number: the two feeds disagree and the scale is why. */
export function magnitude(reading: Reading): string {
  return `M ${reading.magnitude.toFixed(1)}`;
}

/**
 * Relative time, rounded honestly.
 *
 * "2 minutes ago", never "2m 14s ago". Origin time is itself an agency's estimate, so second-level
 * precision on top of it is precision the number does not have.
 */
export function ago(then: number, now: number, archived = false): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  /*
   * "just now" is the last thing in this app that claimed the present about a finished day.
   *
   * It was deferred twice as disproportionate on the grounds that 45 seconds is 0.05% of a day. That is
   * the wrong quantity: the row that gets read is the **newest** one, at the top of the rail, and the gap
   * between the day's end and its newest event is exponential. At this app's rates the top row of an
   * archived day reads "just now" **10% of the time at 200 events and 19% at 400** - not one in two
   * thousand.
   *
   * "the day's end" rather than a clock time, matching the words the activity strip and the transport
   * already use for that edge.
   */
  if (s < 45) return archived ? "at the day's end" : "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? "" : "s"} ago`;
}

/** 24-hour clock in the viewer's own zone. UTC would be correct and unreadable at a glance. */
export function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** `41.82 N 141.31 E`. Signed decimals read as coordinates; hemispheres read as places. */
export function coordinates(reading: Reading): string {
  return latLon(reading.lon, reading.lat);
}

/**
 * The same thing for a point that is not an event.
 *
 * Split out for the far-side figure, whose antipode is a position and not a reading. A second hemisphere
 * formatter beside this one is how `distanceLabel` ended up written twice.
 */
export function latLon(lon: number, lat: number): string {
  const ns = `${Math.abs(lat).toFixed(2)} ${lat >= 0 ? "N" : "S"}`;
  const ew = `${Math.abs(lon).toFixed(2)} ${lon >= 0 ? "E" : "W"}`;
  return `${ns} ${ew}`;
}

/** Depth, or an explicit absence. Zero is a real seabed value and cannot stand in for missing. */
export function depth(reading: Reading): string {
  return Number.isFinite(reading.depthKm) ? `${Math.round(reading.depthKm)} km` : "not given";
}

/**
 * Place names, evened out for display only.
 *
 * USGS writes "72 km E of Petropavlovsk-Kamchatsky, Russia"; EMSC writes "OFF EAST COAST OF
 * KAMCHATKA". Listed together the shouting one looks like an error, and the eye reads the case
 * difference as meaning rather than as two organisations' house styles.
 *
 * Case is not content: this changes how a name is set, never what it says. The detail panel and the
 * screen reader get the same normalised string, so nothing differs between what is seen and what is
 * read aloud. Anything already mixed-case is left exactly as the agency wrote it.
 */
export function place(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|[\s(,\-/])([a-z])/g, (_, lead: string, c: string) =>
    lead + c.toUpperCase());
}

export const SOURCE_NAMES: Record<SourceId, string> = { usgs: "USGS", emsc: "EMSC" };

/**
 * The window's left edge, in words.
 *
 * Reads the coverage the sources brought, not the earliest arrival held. Until coverage reaches the
 * requested window this says when it actually starts instead. DESIGN.md treats the difference as the
 * one between a demo and a claim.
 *
 * The null case is unreachable from the rail, which shows what it is waiting on instead of a label
 * for an absence, and is kept for any caller that has no such alternative.
 */
export function windowLabel(
  now: number, windowMs: number, coveredSince: number | null, archived = false,
): string {
  if (coveredSince === null) return "nothing yet";
  /*
   * An archived day is not "the last 24 hours", it is that day.
   *
   * The last holdout after the archive work: the header states the date, the still says "Archived day",
   * and every age is measured from that day's end, while this line went on describing a span relative to
   * now. Three words rather than the date, because the date is already on the header and in the banner
   * beside this, and a fourth copy is words for their own sake.
   *
   * Always true, not a convenience: the window buttons are 24h, 7d and 30d, and the archived span is
   * exactly one day, so every option covers the whole of it.
   */
  if (archived) return "the whole day";
  if (coveredSince <= now - windowMs) {
    const hours = Math.round(windowMs / 3_600_000);
    // "Last 720 hours" is arithmetically fine and nobody reads a month that way.
    if (hours >= 48) {
      const days = Math.round(hours / 24);
      return `last ${days} day${days === 1 ? "" : "s"}`;
    }
    return `last ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `since ${clock(coveredSince)}`;
}

/**
 * The same thing as `ago`, in the space a table column has.
 *
 * Extracted when the rail's largest-event row needed it too. Two copies of a string transform is how
 * "5h" and "21 hours" end up side by side in one panel, each correct on its own.
 */
export function agoShort(then: number, now: number, archived = false): string {
  return ago(then, now, archived)
    .replace("at the day's end", "end")
    .replace(" ago", "")
    .replace(/ minutes?/, "m")
    .replace(/ hours?/, "h")
    .replace(/ days?/, "d");
}

/** Which agencies reported an event, for the panel's header line. */
export function reportedBy(quake: Quake): string {
  return quake.readings.map((r) => SOURCE_NAMES[r.source]).join(" and ");
}

/**
 * A window length in the space a chip has. `24h`, `7d`, `30d`.
 *
 * Same threshold as the strip's own axis, so 48 hours reads as days in both places rather than as
 * hours in one and days in the other.
 */
export function compactSpan(ms: number): string {
  const h = Math.round(ms / 3_600_000);
  return h >= 48 ? `${Math.round(h / 24)}d` : `${h}h`;
}

/**
 * How far back one agency's backlog reaches, for the label under its own button.
 *
 * Three states, and the third is the one that was missing. A source that vouches for the whole window
 * shows the window; one that vouches for less shows how much less; one that has fetched no backlog at
 * all says so rather than showing a zero, because no backlog and a backlog of nothing are different
 * facts and only one of them is the source's fault.
 */
export function reach(from: number | null, now: number, windowMs: number): string {
  if (from === null) return "no backlog";
  if (from <= now - windowMs) return compactSpan(windowMs);
  return agoShort(from, now);
}

/**
 * The sentence that stops `USGS 30d · EMSC 18h` reading as a bug.
 *
 * Null when every agency vouches for the whole window, which is the common case at a day and the
 * reason this is not a permanent line in the rail. Written the same way as the strip's note about
 * unobserved blocks: it appears exactly when the thing it explains is on screen.
 *
 * Truncated and missing are separate clauses, because they are separate facts with separate causes.
 * A source that returned a short page was capped by the endpoint; a source that returned nothing
 * failed, and it has its own notice elsewhere saying so. One sentence covering both would pin the
 * cap on a feed that never got as far as being capped.
 *
 * The mechanism is stated without the row limit in it. The number lives in the source module, and a
 * second copy here is a number that goes stale in the place nobody thinks to check.
 */
export function reachNote(
  covered: Record<SourceId, number | null>, now: number, windowMs: number,
): string | null {
  const ids = Object.keys(covered) as SourceId[];
  const edge = now - windowMs;
  // Before the first seed lands nothing has reached anywhere, and the rail is already saying that it
  // is asking. A note about short backlogs on top of that describes a state nobody is in yet.
  if (ids.every((id) => covered[id] === null)) return null;

  const truncated = ids.filter((id) => covered[id] !== null && covered[id]! > edge);
  const missing = ids.filter((id) => covered[id] === null);
  if (truncated.length === 0 && missing.length === 0) return null;

  const named = (list: SourceId[]): string => list.map((id) => SOURCE_NAMES[id]).join(" and ");
  const parts: string[] = [];

  if (truncated.length > 0) {
    // The furthest back any truncated source got. Naming the shallowest would understate what is held.
    const deepest = Math.min(...truncated.map((id) => covered[id]!));
    parts.push(truncated.length === 1
      ? `${named(truncated)} returns its most recent page whatever the window, so it reaches only as `
        + `far back as ${agoShort(deepest, now)}.`
      : `${named(truncated)} return their most recent page whatever the window, so they reach only `
        + `as far back as ${agoShort(deepest, now)}.`);
  }
  if (missing.length > 0) {
    parts.push(`${named(missing)} ${missing.length === 1 ? "has" : "have"} returned no backlog.`);
  }

  const full = ids.filter((id) => !truncated.includes(id) && !missing.includes(id));
  if (full.length > 0) parts.push(`Older events are ${named(full)} alone.`);
  return parts.join(" ");
}

/**
 * A share of released energy, as a percentage that never rounds to a whole truth it does not have.
 *
 * One large event in a busy month comes out at 99.94 percent, and "100%" would be a different and false
 * claim: the rest of the catalogue is not nothing, it is four thousand events. So anything above 99.9
 * prints as "over 99.9%" rather than rounding up, and the ordinary range keeps one decimal only while it
 * is doing work.
 */
export function energyPercent(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return "none";
  const pct = share * 100;
  if (pct > 99.9) return "over 99.9%";
  if (pct >= 99) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

/**
 * A ground distance in words. `412 km`, `1,834 km`, and metres below a kilometre.
 *
 * One of these, not two. The scale bar had its own and the pair measurement was about to add a second
 * that differed only in rounding and a guard, which is how "500 m" and "0.5 km" end up in one app.
 * Separated in thousands because a bar reading `10000 km` is a number nobody parses at a glance.
 */
export function distanceLabel(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "unknown";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Math.round(km).toLocaleString("en-GB")} km`;
}

/**
 * How much of the window a source's backlog actually covers, as a fraction of it.
 *
 * The words beside this say "24h" and "6h", which is the duration. This is the proportion, and the two
 * are not the same fact: reading "6h" against "30d" and arriving at a fortieth is arithmetic the reader
 * should not have to do, and a fortieth drawn against a full bar is instant.
 *
 * Zero for a source that fetched no backlog, which is a different thing from one that fetched a short
 * one and is drawn as nothing rather than as a sliver.
 */
export function reachFraction(from: number | null, now: number, windowMs: number): number {
  if (from === null || windowMs <= 0) return 0;
  const covered = now - from;
  return Math.max(0, Math.min(1, covered / windowMs));
}

/**
 * What to print beside a feed's bar, across all three states it can be in.
 *
 * A feed that has answered has a reach. One that has not is either still being waited for or has
 * refused, and those are different facts: the first resolves itself and the second does not. Saying
 * "no backlog" for both, which `reach` alone does, would describe a feed that failed as one that
 * simply had nothing, and the whole point of drawing two bars is that it is visible which feed is
 * carrying the window.
 */
export function reachWords(
  from: number | null, failing: boolean, now: number, windowMs: number,
): string {
  if (from !== null) return reach(from, now, windowMs);
  /*
   * One word, because the column it lands in is 38px wide.
   *
   * "no answer" is two words and wrapped there, which pushed both coverage rows taller and left their
   * rules sitting at different heights - the one place in the rail where a feed failing also broke the
   * layout describing it. "waiting" is one word and never had the problem.
   *
   * `silent` is this app's own term for a source that was asked and did not reply: `silentFeeds` names
   * the layers that way. It keeps the distinction the sentence above defends, since a feed that has not
   * answered yet is still "waiting".
   */
  return failing ? "silent" : "waiting";
}

/**
 * The corroboration rate, stated where it is true rather than left to be inferred.
 *
 * The header prints a bare `both` count and a bare count takes the window's total as its denominator.
 * Two agencies can only agree where both of them were looking, so the honest denominator is the span
 * they share, and at a wide window those two numbers are nothing like each other: 0.9 percent of a
 * 30-day window against 49.5 percent of the 21 hours EMSC reaches, measured against the live feeds.
 *
 * Null when there is nothing to report: no overlap, or an overlap holding nothing. Null also when the
 * overlap is the whole window, because then the header's count already has the right denominator beside
 * it and this would be the same fact printed twice.
 */
export function corroborationNote(
  overlap: { events: number; both: number } | null,
  overlapFrom: number | null,
  now: number,
  windowMs: number,
): string | null {
  if (overlap === null || overlapFrom === null || overlap.events === 0) return null;
  const covered = now - overlapFrom;
  // Within a whisker of the whole window: nothing to explain, and the header is already right.
  if (covered >= windowMs * 0.98) return null;
  const pct = Math.round((overlap.both / overlap.events) * 100);
  return `Both feeds only overlap for the last ${compactSpan(covered)}. Inside it, `
    + `${overlap.both.toLocaleString("en-GB")} of ${overlap.events.toLocaleString("en-GB")} events `
    + `(${pct}%) were reported by both.`;
}

/**
 * What the green wash is, and how much of it there is tonight.
 *
 * The rule this app now holds every new layer to is that none ships without the thing that explains it.
 * The aurora's explanation is already on screen: it appears where the terminator has decided it is dark,
 * because that is the only place an aurora is visible, and the terminator is computed from the real
 * subsolar point rather than styled.
 *
 * The peak is stated because a quiet night is genuinely faint, and a faint wash with nothing saying so is
 * indistinguishable from a layer that failed to load. It is a forecast and says so: NOAA publishes a
 * predicted oval for a stamped minute, not an observation.
 */
export function auroraNote(peak: number, forecastAt: number, now: number): string {
  const strength = peak >= 40 ? "strong" : peak >= 15 ? "active" : "quiet";
  const age = Math.max(0, Math.round((now - forecastAt) / 60_000));
  const when = age < 1 ? "for this minute" : `forecast ${age} minute${age === 1 ? "" : "s"} ago`;
  return `the green is the aurora. `
    + `Only where it is dark enough to see it, ${strength} tonight, peaking at `
    + `${Math.round(peak)}% chance, ${when}.`;
}

/**
 * What the spirals are, and the fact the tracks make visible.
 *
 * The explanation is the track itself: every storm forms in the bands either side of the equator and
 * bends away from it, because the Coriolis force that lets one spin up is zero on the line. A dot could
 * not have said that and a line does not have to.
 *
 * Names the strongest of them by peak wind, from GDACS's number and a scale stated here, because their own
 * label describes a different moment: a storm measured at 259 km/h is filed under "Tropical Storm".
 */
export function cycloneNote(
  storms: readonly { name: string; peakKmh: number | null }[],
  categoryOf: (kmh: number | null) => string | null,
  archived = false,
): string | null {
  if (storms.length === 0) return null;
  /*
   * Tense, not decoration.
   *
   * These sentences said "running now" and "burning now", which is the one thing an archived day makes
   * false. The archive used to withhold these layers entirely so the copy was never wrong; now that a past
   * day draws them, the words have to move with the data or the app is claiming today about last July.
   */
  const count = `${storms.length} tropical cyclone${storms.length === 1 ? "" : "s"} `
    + `${archived ? "that day" : "running"}`;
  const strongest = [...storms].sort((a, b) => (b.peakKmh ?? 0) - (a.peakKmh ?? 0))[0]!;
  const named = strongest.peakKmh === null
    ? ""
    : ` Strongest is ${strongest.name} at ${Math.round(strongest.peakKmh)} km/h`
      + `${categoryOf(strongest.peakKmh) ? `, ${categoryOf(strongest.peakKmh)}` : ""} at its peak.`;
  return `the spirals are storms, ${count}. `
    + `The tail behind each is where it has been, and none of them are on the equator: the spin that `
    + `starts one is zero there.${named}`;
}

/**
 * What the triangles are, and the one thing that has to be said out loud about them.
 *
 * Every other layer here is live, and a viewer is entitled to assume this one is too. It is not: GDACS
 * flags none of these current, and the newest episode in the list is usually weeks old. So the sentence
 * leads with the age rather than burying it, because a triangle that looks live and is not would be the
 * app lying quietly.
 *
 * What is left when currency goes is the better fact anyway: they land on the plate boundaries the globe
 * already draws, which is the same argument the earthquakes make from the other side.
 */
export function volcanoNote(
  count: number, newest: number | null, now: number, archived = false,
): string | null {
  if (count === 0) return null;
  const days = newest === null ? null : Math.max(0, Math.round((now - newest) / 86_400_000));
  /*
   * "Today" and "ago" are both spoken from now, which is not where an archived day is read from.
   * The clock is already the archived one, so the words have to match it: an episode that ended
   * inside the loaded day ended *that* day, and one before it ended so many days *earlier*.
   */
  const plural = days === 1 ? "" : "s";
  const when = days === null
    ? "Undated"
    : days === 0
      ? `The newest episode ended ${archived ? "that day" : "today"}`
      : `The newest ended ${days} day${plural} ${archived ? "earlier" : "ago"}`;
  return `the triangles are volcanoes, ${count} of them. `
    + `Each has a logged eruption episode. `
    // "this minute" is a claim about now, which is the wrong clock over a picture of a past day.
    + `${when}, so none of this ${archived ? "was erupting then" : "is erupting this minute"}. `
    + `They sit along the same lines the earthquakes do, which is the whole of why either happens.`;
}

/**
 * What the flames are, and the one caveat that cannot be left out.
 *
 * Every number here is real and the count is not the world's. GDACS caps its list at 100 and cannot be
 * paged past it, and a request for Angola alone comes back with a full hundred, so the global response is a
 * slice of thousands. The geography in it is right - late August is the southern African burning season -
 * but the number of marks is a floor, and a map that showed a hundred fires without saying so would be
 * claiming a census it does not have.
 *
 * The duration is the fact this layer brings that no other mark here can: an earthquake is an instant and
 * a fire is a fortnight.
 */
/*
 * "Russian Federation alone has more than that" is missing a word, and which countries need it is not a
 * judgement call: a name headed by a common noun takes the article and a proper-noun name does not.
 * Angola, Brazil, Australia; the Russian Federation, the Philippines, the United States.
 *
 * GDACS already capitalises "The Democratic Republic of Congo", so the check for one is first.
 */
const COMMON_NOUN_HEADS = [
  "federation", "republic", "kingdom", "states", "islands", "emirates",
  "netherlands", "philippines", "gambia", "bahamas", "maldives", "comoros",
];

export function theOf(country: string): string {
  // The head only. "Zambia, The Democratic Republic of Congo" is headed by Zambia and takes nothing,
  // even though a Republic appears later in it.
  const head = (country.split(",")[0] ?? "").trim().toLowerCase();
  if (head.startsWith("the ")) return country;
  return COMMON_NOUN_HEADS.some((w) => head.includes(w)) ? `the ${country}` : country;
}

export function wildfireNote(
  fire: { count: number; km2: number; medianDays: number | null; leader: string | null },
  cap: number,
  archived = false,
): string | null {
  if (fire.count === 0) return null;
  const burning = fire.medianDays === null
    ? ""
    : `, burning ${fire.medianDays} day${fire.medianDays === 1 ? "" : "s"} at the median`;
  // The cap is a fact about the live feed. The archive is a different upstream with room to spare.
  const floor = !archived && fire.count >= cap
    ? ` The feed stops at ${cap} and ${fire.leader === null ? "one country" : theOf(fire.leader)} `
      + `alone has more than that, so the `
      + `count is a floor: every mark is real, their number is not the world's.`
    : "";
  return `the flames are forest fires, ${fire.count} of them. `
    + `${archived ? "They burned that day" : "Burning now"}, `
    + `${fire.km2.toLocaleString("en-GB")} square kilometres alight${burning}.${floor}`;
}

/**
 * What the waves are, and what they decline to say.
 *
 * The cap is not in play here: floods spread thin, no more than three to a country, and a single-country
 * request returns ten where the same request for fires returns a hundred. So this count is the count.
 *
 * There is nothing to rank them by. GDACS files every flood in the list as `severity: 0.0`, "Magnitude 0",
 * so the mark says where and refuses to imply how bad - which for a flood is the number a reader most
 * wants and the one nobody keyless has.
 */
export function floodNote(count: number, countries: number, archived = false): string | null {
  if (count === 0) return null;
  const where = countries > 1 ? ` across ${countries} countries` : "";
  return `the waves are floods, ${count} of them${where}. `
    + `${archived ? "They ran that day" : "Running now"}, and nothing here rates them: every flood in `
    + `this feed is filed as magnitude zero, so the mark says where and not how bad.`;
}

/**
 * The far-side figure, explained where it is drawn.
 *
 * Every number in it is spherical geometry and none of it is a time, which is the point of the last
 * sentence. The live rings fade at 17 degrees of arc and a surface path to the far side is 55 minutes,
 * so a figure that put minutes on these arcs would be claiming the teleseismic path through the mantle
 * that `arrival.ts` already refused by capping arrivals at 700km.
 *
 * The 30-and-150 pair is the whole argument and it is stated as one clause: the same length of front,
 * because by 150 it is closing rather than growing.
 */
export function farSideNote(
  arcs: readonly number[], lengthOf: (arcDeg: number) => number,
  far: { lon: number; lat: number },
): string {
  const widest = Math.max(...arcs.map(lengthOf));
  const first = arcs[0]!;
  const last = arcs[arcs.length - 1]!;
  const km = (v: number): string => `${Math.round(v).toLocaleString("en")} km`;
  return `The arcs are where the front would be at ${arcs.join(", ")} degrees from here. `
    + `It is widest on the great circle, ${km(widest)} of front, and the ${last}-degree arc is the same `
    + `length as the ${first} because by then it is closing rather than growing. It closes to the point `
    + `marked at ${latLon(far.lon, far.lat)}. No time is drawn: the wavefronts above fade at 17 degrees, `
    + `and the far side is most of an hour away.`;
}

/**
 * What the arrows are, and the word without which they mean something else.
 *
 * **Relative.** Each arrow is the plate on one side of that boundary moving with respect to the plate on
 * the other, which is what PB2002 publishes; read as absolute motion over the mantle it would be wrong
 * everywhere. An arrow cannot carry that word, so the sentence has to.
 *
 * The angle is the reading worth pointing out, because it is free and nobody would look for it: across
 * the line means opening, into it means closing, along it means sliding.
 */
export function motionNote(
  motion: { arrows: number; fastest: number; converging: number },
): string {
  return `the arrows are how fast the plates are moving, one side relative to the other, sampled every `
    + `800km. Across a line is opening, into it is closing, along it is sliding. ${motion.converging} of `
    + `the ${motion.arrows} are closing, and the fastest runs at ${Math.round(motion.fastest)} mm a year, `
    + `which is a metre every four years.`;
}

/**
 * Where an event sits relative to the plate edges, for the panel.
 *
 * The distance alone is the whole feature: next to a place name the agency already wrote, a boundary
 * 3,557 km away under Pahala, Hawaii tells the hotspot story to anyone who thinks about it, and the app
 * never has to claim anything about hotspots. Close enough and it says "on it" rather than printing a
 * suspiciously round zero.
 *
 * The bands are stated where they are because the measured median for a real day was 93 km: half of
 * everything lands inside the first band, so a scale that started at 500 km would call almost every
 * earthquake on Earth "near".
 */
export function boundaryNote(km: number | null): string | null {
  if (km === null) return null;
  // Compact, because its only consumer is a field labelled "Boundary": spelling out "from the nearest
  // plate boundary" there said the word twice and wrapped the value onto a second line.
  if (km < 25) return "on it";
  return `${Math.round(km).toLocaleString("en")} km away`;
}

/**
 * The negative space, as the one sentence this data can carry.
 *
 * Not "the cratons are quiet", which is a claim about hundreds of millions of years against a buffer
 * holding at most thirty days. What is left is still the same shape of fact: the events cluster on a small
 * part of the surface, and the ratio says how hard.
 *
 * The concentration is stated as a floor rather than a figure, and that is not hedging. A dense network
 * finds magnitude 2 events under Oklahoma while nobody is listening in the middle of the Pacific, so the
 * catalogue over-counts the interiors, which pushes this ratio **down**. The true concentration is higher
 * than whatever this says.
 */
export function quietNote(
  near: number, total: number, bandKm: number, bandShare: number,
): string | null {
  const parts = quietParts(near, total, bandShare);
  if (parts === null) return null;
  /*
   * Written as a note on the cells above it, which is what a NOTES row is.
   *
   * It used to restate the band and the percentage that ON EDGE and BAND already print, then close with
   * "the rest of the planet had the day off" - 31 words to carry one ratio. The flourish moved to the
   * still, where the deadpan is the whole job and there is nothing else on the image to carry it.
   */
  return `That ${bandKm} km band is ${(bandShare * 100).toFixed(1)}% of the surface, so at least `
    + `${parts.times.toFixed(1)} times the seismicity per square kilometre.`;
}

/**
 * The same fact, split so the title block can carry the number and the note can keep the argument.
 *
 * A drafting sheet puts values in framed cells and reasoning in a notes line. The percentage was
 * previously buried at the head of a sentence, where it was the one part of that sentence a reader
 * actually scanned for, and the four sentences stacked above the first control were what made the rail
 * read as something to be read rather than operated.
 */
export function quietParts(
  near: number, total: number, bandShare: number,
): { percent: number; times: number } | null {
  if (total === 0) return null;
  const share = near / total;
  return { percent: Math.round(share * 100), times: share / bandShare };
}

/**
 * What the holes in the markers add up to, for the depth row of the legend.
 *
 * A count rather than a promise. The encoding carves a hole in proportion to depth, and the reading it
 * exists for - a subduction margin resolving into rings inland - needs deep events to be present at all.
 * In a typical 24-hour window one event of seventy-nine is below 300km. So this says how many are there,
 * and a viewer who sees "1 below 300 km" knows not to go looking for a slab today.
 *
 * `unknown` is reported rather than folded into shallow, because a missing depth and a depth of zero are
 * different facts and only one of them is the agency's fault.
 */
export function depthNote(bands: {
  shallow: number; intermediate: number; deep: number; unknown: number; total: number;
}): string | null {
  if (bands.total === 0) return null;
  /*
   * Grouped, because a month of a busy margin runs into four figures.
   *
   * Every other count this app prints goes through `toLocaleString`; these four did not, so a thirty-day
   * window put "1188 above 70 km" in the key beside a headline reading "1,188". The hazard counts a few
   * functions up are left alone deliberately: their feeds cap them in the tens, so grouping them would be
   * a separator that can never appear.
   */
  const n = (v: number): string => v.toLocaleString("en-GB");
  const parts = [`${n(bands.shallow)} above 70 km`];
  if (bands.intermediate > 0) parts.push(`${n(bands.intermediate)} between 70 and 300`);
  parts.push(`${n(bands.deep)} below 300`);
  if (bands.unknown > 0) parts.push(`${n(bands.unknown)} with no depth given`);
  return `${parts.join(", ")}. Deep events sit inside a descending slab, so a margin only resolves `
    + `into rings when enough of them land.`;
}

/**
 * What the sound is, and the two things it is not.
 *
 * Both disclosures are load-bearing. It is **not a recording**: ground motion is below hearing, under
 * about 10 Hz, so every audible rendering is a transposition - the same admission the wavefronts make by
 * printing their x20 multiplier instead of hiding it. And **loudness is not energy**: three points of
 * magnitude is thirty thousand times the energy, which no speaker can express, so the gain is compressed
 * and saying so is the difference between a scale and a decoration.
 *
 * The pitch direction is worth one clause because it is derived rather than chosen: a larger rupture
 * radiates a lower corner frequency, so bigger really is lower.
 */
export function soundNote(above: number): string {
  return `one tone per arrival above M${above.toFixed(1)}, lower for bigger, which is the direction a `
    + `real rupture goes. It is not a recording: ground motion is below hearing, under about 10 Hz. And `
    + `loudness is not energy, because three points of magnitude is thirty thousand times as much of it.`;
}

/**
 * A layer's note, split into the line a key needs and the reasoning behind it.
 *
 * Six layers each had a paragraph and all six were expanded at once, which made the legend the tallest
 * wall of prose in the app. A drawing's key is glyphs against short names, with the reasoning available
 * rather than always shown.
 *
 * No copy was rewritten to get this. Every note already opens with exactly the line a key wants - "the
 * spirals are storms, trailing where they have been", "the waves are floods running now, 9 of them
 * across 9 countries" - because each was written to lead with what the glyph is. So the split is the
 * first sentence, and the layer rule in PLAN.local.md still holds: the explanation arrives with the
 * layer, one press away rather than filling the rail.
 *
 * Split on a full stop followed by whitespace, so the decimals and percentages inside these sentences
 * are not sentence ends. A note with nothing after the first stop returns a null rest, and the row
 * renders flat: a disclosure with nothing behind it is a control that lies about having more to say.
 */
/*
 * The first sentence is the whole row when the key is shut, which is a budget rather than a formality.
 *
 * `KeyRow` shows `head` collapsed and hides `rest` behind the disclosure, so a first sentence carrying its
 * own qualifier makes a nine-row key nine two-line paragraphs: a wall down the side of the globe, which is
 * what the key is supposed to be read *against*. Five of the notes did exactly that. Each one now names the
 * mark and its count and stops, and everything that was after the comma moved past the full stop, where the
 * disclosure was already waiting to put it.
 */
export function splitNote(note: string): { head: string; rest: string | null } {
  const at = note.search(/\.\s/);
  if (at === -1) return { head: note, rest: null };
  const rest = note.slice(at + 1).trim();
  return { head: note.slice(0, at + 1), rest: rest.length > 0 ? rest : null };
}

/**
 * The layers that could not be asked, named so absence is not read as calm.
 *
 * Every other absence in this app is stated: the archive prints "did not answer", `History.answered`
 * keeps "nothing happened" apart from "nobody answered", and a dead earthquake feed says so. The four
 * live hazard layers plus the aurora were the one place where a dead host and a quiet planet drew the
 * same globe and said the same nothing.
 *
 * Null while everything answered, because a line reading "all feeds fine" is the reassurance this app
 * spends no words on. Only the failures are worth a sentence.
 */
export function silentFeeds(answered: {
  cyclones: boolean; volcanoes: boolean; fires: boolean; floods: boolean; aurora: boolean;
}): string | null {
  const names: [keyof typeof answered, string][] = [
    ["cyclones", "storms"], ["fires", "fires"], ["floods", "floods"],
    ["volcanoes", "volcanoes"], ["aurora", "the aurora"],
  ];
  const missing = names.filter(([key]) => !answered[key]).map(([, label]) => label);
  if (missing.length === 0) return null;
  // All five is one fact about the network, not five facts about layers.
  if (missing.length === names.length) return "No feed answered for any layer, so none are drawn.";
  const listed = missing.length === 1
    ? missing[0]!
    : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]!}`;
  return `No answer for ${listed}: absent here does not mean absent.`;
}
