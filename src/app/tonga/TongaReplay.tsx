import { ArchiveScene } from "../ArchiveScene";
import "./tonga.css";

export const TONGA_DAY = "2022-01-15";
const load = () => import("./TongaStage").then(({ TongaStage }) => TongaStage);

export function TongaReplay({ className }: { className?: string }): JSX.Element {
  return (
    <ArchiveScene
      label="Watch Tonga’s shockwave"
      title="Tonga’s shockwave"
      className={className}
      load={load}
      subtitle={
        <>
          <span>Hunga Tonga–Hunga Haʻapai</span>
          <time dateTime={TONGA_DAY}>15 Jan 2022</time>
        </>
      }
      credits={
        <>
          <a href="https://registry.opendata.aws/noaa-goes/" target="_blank" rel="noreferrer">
            NOAA GOES-17
          </a>
          <a
            href="https://mesonet.agron.iastate.edu/request/asos/1min.phtml"
            target="_blank"
            rel="noreferrer"
          >
            ASOS via Iowa Mesonet
          </a>
          <a href="https://doi.org/10.1038/s41586-022-05012-5" target="_blank" rel="noreferrer">
            Wave study
          </a>
        </>
      }
    />
  );
}
