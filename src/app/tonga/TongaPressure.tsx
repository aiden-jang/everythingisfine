import { PressureChart } from "./PressureChart";
import { KeepPressure } from "./KeepPressure";
import { stations, timeIso, timeLabel, pressureAt } from "./tongaTimeline";
import { ShareMoment } from "../observations/StorySession";
import { pressureShare } from "./pressureShare";
import type { TongaStation } from "./useTongaPlayback";

export function TongaPressure({
  station,
  minute,
  map,
  shared,
  onSeek,
  onKeep,
  onJourney,
}: {
  station: TongaStation;
  minute: number;
  map: boolean;
  shared: boolean;
  onSeek: (minute: number, station: TongaStation) => void;
  onKeep: () => void;
  onJourney: (restart: boolean) => void;
}) {
  const value = pressureAt(station, minute);
  return (
    <section className="tonga-evidence" aria-label={`${station.name} pressure evidence`}>
      <div className="tonga-evidence-body" data-evidence-body="">
        <div className="tonga-evidence-meta">
          <span>{shared ? "A shared observation" : "15 January 2022"}</span>
          <span>ASOS · {station.id}</span>
        </div>
        {shared && <h2 className="tonga-recipient-title">A pulse recorded in {station.name}.</h2>}
        {!shared && (
          <label className="tonga-evidence-station">
            Ground station
            <select
              value={station.id}
              onChange={(event) => {
                const next = stations.find(({ id }) => id === event.currentTarget.value)!;
                onSeek(next.peak, next);
              }}
            >
              {stations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="tonga-evidence-reading">
          {!shared && <h2>{station.name}.</h2>}
          <strong>
            {value?.toFixed(2) ?? "—"}
            <span>hPa</span>
          </strong>
        </div>
        <p className="tonga-evidence-time">
          <time dateTime={timeIso(minute)}>{timeLabel(minute)} UTC</time>
          {shared ? " · 15 January 2022" : " · drag the trace to inspect"}
        </p>
        <PressureChart
          linked
          station={station}
          minute={minute}
          {...(!shared ? { onSeek: (next) => onSeek(next, station) } : {})}
        />
        <p className="tonga-evidence-source">
          One-minute station pressure · ASOS / IEM.
          <br />
          The expanding wave is illustrative.
        </p>
        <details className="tonga-evidence-coverage">
          <summary>Sources &amp; coverage</summary>
          <p>
            Ground pressure is measured at one-minute intervals. The globe’s wave is an illustration of the
            first Lamb wave.
          </p>
          <a
            href="https://mesonet.agron.iastate.edu/request/asos/1min.phtml"
            target="_blank"
            rel="noreferrer"
          >
            ASOS via Iowa Mesonet
          </a>
          <a href="https://registry.opendata.aws/noaa-goes/" target="_blank" rel="noreferrer">
            NOAA GOES-17 imagery
          </a>
          <a href="https://doi.org/10.1038/s41586-022-05012-5" target="_blank" rel="noreferrer">
            Wave study
          </a>
        </details>
      </div>
      <div className="tonga-evidence-actions">
        {shared ? (
          <>
            <button type="button" className="tonga-primary" onClick={() => onJourney(true)}>
              Follow the full story
            </button>
            <button type="button" onClick={() => onSeek(minute, station)}>
              Inspect reading
            </button>
          </>
        ) : (
          <>
            <KeepPressure station={station} minute={minute} map={map} onKept={onKeep} />
            <button type="button" onClick={() => onJourney(false)}>
              Back to journey
            </button>
          </>
        )}
      </div>
      {!shared && (
        <ShareMoment
          label="Share finding"
          share={pressureShare}
          current={() => ({
            id: "tonga",
            at: Date.parse(timeIso(minute)),
            choice: station.id,
            chapter: "pressure",
            map,
          })}
        />
      )}
    </section>
  );
}
