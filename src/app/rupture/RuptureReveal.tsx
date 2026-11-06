import { ArchiveScene } from "../ArchiveScene";
import "./recorded-waves.css";

const EVENT = "https://earthquake.usgs.gov/earthquakes/eventpage/usc0001xgp";
export const TOHOKU_DAY = "2011-03-11";

const load = () => import("./RuptureStage").then(({ RuptureStage }) => RuptureStage);

export function RuptureReveal({ className }: { className?: string }): JSX.Element {
  return (
    <ArchiveScene
      label="Watch Tōhoku rupture"
      title="The Tōhoku rupture"
      className={className}
      load={load}
      subtitle={
        <>
          <time dateTime="2011-03-11T05:46:24Z">11 Mar 2011 · 05:46:24 UTC</time>
          <span> M9.1 · 29 km deep</span>
        </>
      }
      credits={
        <>
          <a href={EVENT + "/finite-fault"} target="_blank" rel="noreferrer">
            USGS finite fault
          </a>
          <a href={EVENT + "/shakemap"} target="_blank" rel="noreferrer">
            USGS ShakeMap
          </a>
          <span>Coastlines by Natural Earth</span>
        </>
      }
    />
  );
}
