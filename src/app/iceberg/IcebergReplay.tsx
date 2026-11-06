import { ArchiveScene } from "../ArchiveScene";
import "./iceberg.css";

export const ICEBERG_DAY = "2020-12-23";
const load = () => import("./IcebergStage").then(({ IcebergStage }) => IcebergStage);

export function IcebergReplay({ className }: { className?: string }): JSX.Element {
  return (
    <ArchiveScene
      label="Follow iceberg A-68A"
      title="Iceberg Drift"
      className={className}
      load={load}
      subtitle={
        <>
          <span>Scotia Sea to South Georgia</span>
          <span>Nov 2020–Apr 2021</span>
        </>
      }
      credits={
        <>
          <a
            href="https://doi.org/10.5285/d56d9e3f-80d2-4076-9e70-24f662c0e362"
            aria-label="Tracks by Smith and Bigg, UK Polar Data Centre"
            target="_blank"
            rel="noreferrer"
          >
            UK Polar Data Centre
          </a>
          <a
            href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
            target="_blank"
            rel="noreferrer"
          >
            OGL v3.0
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
      }
    />
  );
}
