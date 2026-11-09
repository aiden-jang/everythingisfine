import { earthStories, type EarthStoryId } from "./catalogue";

export function StorySources({ id }: { id: EarthStoryId }): JSX.Element {
  const meta = earthStories[id];
  return (
    <>
      <p>{meta.note}</p>
      <a href={meta.url} target="_blank" rel="noreferrer">
        {meta.source}
      </a>
      {id === "aral" && (
        <>
          <span>Source: EC JRC/Google</span>
          <a href="https://doi.org/10.1038/nature20584">
            Pekel et al. (2016), High-resolution mapping of global surface water
          </a>
        </>
      )}
      {id === "water" && <span>JPL RL06 V2 · monthly archive</span>}
      {(id === "fault" || id === "fire") && (
        <a href="https://www.usgs.gov/3d-elevation-program">USGS 3DEP shaded terrain</a>
      )}
      {id === "fault" && (
        <a href="https://aria-share.jpl.nasa.gov/20190704-California_EQ/">
          NASA / JPL-Caltech · JAXA ALOS-2 radar
        </a>
      )}
      {id === "dust" && (
        <a href="https://asdc.larc.nasa.gov/calipso-imagery/lidar/browse_images/std_v500_showdate.php?browse_date=2020-06-23">
          NASA / CNES CALIPSO · 532 nm backscatter · V5.00
        </a>
      )}
      {id === "eclipse" && (
        <a href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons · Sun and Moon positions</a>
      )}
    </>
  );
}
