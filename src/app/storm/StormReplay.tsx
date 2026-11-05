import { ArchiveScene } from "../ArchiveScene";
import "./storm.css";

export const KATRINA_DAY = "2005-08-29";
const load = () => import("./StormStage").then(({ StormStage }) => StormStage);

export function StormReplay({ className }: { className?: string }): JSX.Element {
  return (
    <ArchiveScene
      label="Follow Hurricane Katrina"
      title="Eye of the Storm"
      className={className}
      load={load}
      subtitle={
        <>
          <span>Hurricane Katrina</span>
          <time dateTime="2005-08-29">28–29 Aug 2005</time>
        </>
      }
      credits={
        <>
          <a href="https://www.nhc.noaa.gov/data/" target="_blank" rel="noreferrer">
            NOAA HURDAT2
          </a>
          <a href="https://www.nhc.noaa.gov/data/tcr/AL122005_Katrina.pdf" target="_blank" rel="noreferrer">
            NHC Katrina report
          </a>
          <span>Coastlines by Natural Earth</span>
        </>
      }
    />
  );
}
