import { skyCities } from "../app/tonight/cities";
import "../app/discovery/discovery.css";

export function PlaceLabels() {
  return (
    <div className="place-labels" aria-hidden="true">
      {skyCities.map((city) => (
        <span
          key={city.name}
          data-observation-anchor=""
          data-min-zoom="2.6"
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
