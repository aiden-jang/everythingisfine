import type { ObservationMark } from "../observations/types";
import { EvidenceConnector } from "../observations/EvidenceConnector";
import { nameOf } from "./icebergTimeline";

export function IcebergWorld({
  marks,
  fragment,
  select,
  linked,
}: {
  marks: readonly ObservationMark[];
  fragment: string;
  select: (index: number) => void;
  linked: boolean;
}) {
  return (
    <>
      <div className="iceberg-fragments" aria-label="Recorded iceberg positions">
        {marks.map(({ id, lon, lat }, index) => (
          <button
            key={id}
            type="button"
            data-observation-anchor=""
            data-compact-anchor=""
            data-lon={lon}
            data-lat={lat}
            data-evidence-source={linked && id === fragment ? "true" : undefined}
            data-projection-anchor={id === fragment || undefined}
            aria-pressed={id === fragment}
            aria-label={`Inspect ${nameOf(id!)}`}
            onClick={() => select(index)}
          >
            <span aria-hidden="true">{nameOf(id!)}</span>
          </button>
        ))}
        <span className="iceberg-coast-label" data-observation-anchor="" data-lon="-36.65" data-lat="-54.21">
          South Georgia
        </span>
      </div>
      {linked && <EvidenceConnector key={fragment} trace />}
    </>
  );
}

export const icebergSources = (
  <>
    <a
      href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
      target="_blank"
      rel="noreferrer"
    >
      UK Polar Data Centre tracks · OGL v3.0
    </a>
    <a
      href="https://science.nasa.gov/earth/earth-observatory/iceberg-a-68a-nears-south-georgia-147535/"
      target="_blank"
      rel="noreferrer"
    >
      Terra MODIS
    </a>
    <a
      href="https://science.nasa.gov/earth/earth-observatory/iceberg-goes-with-the-flow-147715/"
      target="_blank"
      rel="noreferrer"
    >
      Landsat 8
    </a>
    <a
      href="https://science.nasa.gov/earth/earth-observatory/pieces-of-iceberg-a-68a-147785/"
      target="_blank"
      rel="noreferrer"
    >
      NOAA-20 VIIRS
    </a>
  </>
);
