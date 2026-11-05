import { ArchiveScene } from "../ArchiveScene";
import "./kilauea.css";

export const KAPOHO_DAY = "2018-06-04";
const load = () => import("./KilaueaStage").then(({ KilaueaStage }) => KilaueaStage);

export function KilaueaReplay({ className }: { className?: string }): JSX.Element {
  return (
    <ArchiveScene
      label="Follow Kīlauea’s lava"
      title="A new coastline"
      className={className}
      load={load}
      subtitle={
        <>
          <span>Kīlauea, Hawaiʻi Island</span>
          <time dateTime="2018">May–August 2018</time>
        </>
      }
      credits={
        <>
          <a href="https://doi.org/10.5066/P9S7UQKQ" target="_blank" rel="noreferrer">
            USGS lava maps
          </a>
          <a href="https://files.hawaii.gov/dbedt/op/gis/data/coastline.pdf" target="_blank" rel="noreferrer">
            Historic coastline
          </a>
          <a
            href="https://www.usgs.gov/3d-elevation-program/about-3dep-products-services"
            target="_blank"
            rel="noreferrer"
          >
            USGS reference relief
          </a>
          <a
            href="https://www.usgs.gov/media/videos/kilauea-volcano-lava-entering-kapoho-bay"
            target="_blank"
            rel="noreferrer"
          >
            HVO overflight
          </a>
        </>
      }
    />
  );
}
