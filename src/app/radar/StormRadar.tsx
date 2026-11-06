import { RADAR_SERVICE } from "../../sources/radar";
import { ArchiveScene } from "../ArchiveScene";
import "./radar.css";

const load = () => import("./RadarStage").then(({ RadarStage }) => RadarStage);

export function StormRadar({ className }: { className?: string }): JSX.Element {
  return (
    <ArchiveScene
      label="Storm Radar"
      title="Storm Radar"
      subtitle="Recent NOAA radar scans · Contiguous United States"
      className={className}
      load={load}
      credits={
        <>
          <a href={RADAR_SERVICE} target="_blank" rel="noreferrer">
            NOAA MRMS radar
          </a>
          <a href="https://www.weather.gov/jetstream/reflectivity" target="_blank" rel="noreferrer">
            What reflectivity means
          </a>
          <a
            href="https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html"
            target="_blank"
            rel="noreferrer"
          >
            U.S. Census boundaries
          </a>
        </>
      }
    />
  );
}
