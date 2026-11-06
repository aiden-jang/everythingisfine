import { ArchiveScene } from "../ArchiveScene";
import "./megaflash.css";

export const MEGAFLASH_DAY = "2017-10-22";
const load = () => import("./MegaflashStage").then(({ MegaflashStage }) => MegaflashStage);

export function MegaflashReplay({ className }: { className?: string }): JSX.Element {
  return (
    <ArchiveScene
      label="Watch Megaflash"
      title="Megaflash"
      className={className}
      load={load}
      subtitle={
        <>
          <span>Southern Plains, United States</span>
          <time dateTime="2017-10-22T08:56:45.834Z">Oct 22, 2017 · 08:56 UTC</time>
        </>
      }
      credits={
        <>
          <a href="https://doi.org/10.1175/BAMS-D-25-0037.1" target="_blank" rel="noreferrer">
            GLM trace · Peterson et al.
          </a>
          <a
            href="https://www.nesdis.noaa.gov/news/noaa-satellites-help-certify-worlds-longest-lightning-flash"
            target="_blank"
            rel="noreferrer"
          >
            NOAA GOES-16
          </a>
          <a
            href="https://wmo.int/news/media-centre/wmo-certifies-megaflash-lightning-record-usa"
            target="_blank"
            rel="noreferrer"
          >
            WMO certification
          </a>
        </>
      }
    />
  );
}
