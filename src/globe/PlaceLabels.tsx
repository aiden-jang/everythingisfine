import { skyCities } from "../app/tonight/cities";
import "../app/discovery/discovery.css";
import type { Mark } from "./marks";

const regionalCities = new Set(["New York", "London", "São Paulo", "Cape Town", "Delhi", "Tokyo", "Sydney"]);

export function PlaceLabels({
  pin,
  marks,
}: {
  pin: { lon: number; lat: number } | null;
  marks: readonly Mark[];
}) {
  const storms = marks.filter((mark) => mark.caption && mark.anchor).slice(0, 12);
  return (
    <div className="place-labels" aria-hidden="true">
      {pin && (
        <span className="place-reticle" data-observation-anchor="" data-lon={pin.lon} data-lat={pin.lat}>
          <svg viewBox="0 0 36 36" width="36" height="36" fill="none" aria-hidden="true">
            <circle cx="18" cy="18" r="12" />
            <path d="M18 2v8m0 16v8M2 18h8m16 0h8" />
            <circle cx="18" cy="18" r="2" fill="currentColor" />
          </svg>
        </span>
      )}
      {storms.map(({ anchor, caption, id }) => (
        <span
          key={id}
          className="storm-label"
          data-observation-anchor=""
          data-min-zoom="1.7"
          data-place-label=""
          data-lon={anchor!.lon}
          data-lat={anchor!.lat}
        >
          {caption}
        </span>
      ))}
      {skyCities.map((city) => (
        <span
          key={city.name}
          data-observation-anchor=""
          data-min-zoom={regionalCities.has(city.name) ? 1.7 : 2.7}
          data-place-label=""
          data-lon={city.lon}
          data-lat={city.lat}
        >
          {city.name}
        </span>
      ))}
    </div>
  );
}
