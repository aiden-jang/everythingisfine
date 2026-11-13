import { useMemo, useState } from "react";
import type { Feed } from "../feed";
import type { Filters, Quake } from "../../data/types";
import type { HazardGroup } from "../hazards";
import type { FeedStatus } from "../feedStatus";
import { skyCities } from "../tonight/cities";
import { matches } from "../../data/filter";
import { distanceKm } from "../../geo/sphere";
import { layerTime } from "../layerTime";
import { refreshAnnotations } from "../../globe/annotationInput";

export interface PlaceContextProps {
  feed: Feed;
  filters: Filters;
  at: number;
  now: number;
  revision: number;
  hazards: readonly HazardGroup[];
  feeds: FeedStatus;
}
export function nearbyQuakes(
  feed: Pick<Feed, "store">,
  filters: Filters,
  at: number,
  now: number,
  place: { lon: number; lat: number },
) {
  const found: Quake[] = [];
  feed.store.forEach((quake) => {
    const p = quake.primary;
    if (p.time <= at && matches(quake, filters, now) && distanceKm(place.lon, place.lat, p.lon, p.lat) <= 500)
      found.push(quake);
  });
  return found.sort((a, b) => b.primary.time - a.primary.time);
}
export function PlaceContext(props: PlaceContextProps) {
  return (
    <div className="place-context place-search">
      <PlaceReadings {...props} />
    </div>
  );
}

function PlaceReadings({ feed, filters, at, now, revision, hazards, feeds }: PlaceContextProps) {
  const [name, setName] = useState("");
  const place = skyCities.find((city) => city.name.toLowerCase() === name.trim().toLowerCase());
  const quakes = useMemo(() => {
    void revision;
    return place ? nearbyQuakes(feed, filters, at, now, place) : [];
  }, [place, feed, filters, at, now, revision]);
  const other = place
    ? hazards
        .flatMap(({ rows }) => rows)
        .filter((row) => distanceKm(place.lon, place.lat, row.lon, row.lat) <= 500)
    : [];
  const unavailable = feeds.rows.filter((row) => row.state === "failed" || row.state === "pending");
  return (
    <>
      <label className="explorer-search">
        <span className="sr-only">Find a place</span>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m15 15 6 6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <input
          type="search"
          name="place"
          autoComplete="off"
          placeholder="Find a place…"
          list="explorer-places"
          value={name}
          onInput={(event) => setName(event.currentTarget.value)}
        />
        <datalist id="explorer-places">
          {skyCities.map((city) => (
            <option key={city.name} value={city.name} />
          ))}
        </datalist>
      </label>
      {name && !place && <p>Choose a city from the suggestions to see nearby reports.</p>}
      {place && (
        <section aria-label={`Observations around ${name}`}>
          <button type="button" className="place-locate" onClick={() => refreshAnnotations(place)}>
            Locate {place.name}
          </button>
          <p>Within 500 km · chosen layers and time window. Available reports only.</p>
          <p>
            {quakes.length} earthquake{quakes.length === 1 ? "" : "s"} · {other.length} other reported event
            {other.length === 1 ? "" : "s"}
          </p>
          <ul>
            {quakes.slice(0, 3).map(({ key, primary: p }) => (
              <li key={key}>
                <strong>{p.place || "Earthquake"}</strong>
                <span>
                  {p.magnitude.toFixed(1)} {p.scale || "magnitude"} · {p.source.toUpperCase()}
                </span>
                <time dateTime={new Date(p.time).toISOString()}>{layerTime(p.time)}</time>
              </li>
            ))}
            {other.slice(0, 3).map((row) => (
              <li key={row.id}>
                <strong>{row.name}</strong>
                <span>
                  {row.kind} · {row.measure}
                </span>
                <span>{row.age}</span>
              </li>
            ))}
          </ul>
          {unavailable.length > 0 && (
            <p role="status">
              Some sources have not answered: {unavailable.map((row) => row.label).join(", ")}. Missing
              reports are not evidence of no activity.
            </p>
          )}
          <p>
            Weather overlays keep their own displayed scan or forecast times. Counts describe reports, not
            conditions everywhere in the region.
          </p>
        </section>
      )}
    </>
  );
}
