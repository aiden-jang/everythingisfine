import { useStoryNavigation } from "../journeys/StoryNavigation";
import { ShareMoment } from "../observations/StorySession";
import { savedVisitKey } from "../visitor/library";
import { pressureShare } from "./pressureShare";
import { pressureAt, stations, timeIso, timeLabel } from "./tongaTimeline";

export function TongaKept({
  onInspect,
  onJourney,
}: {
  onInspect: (minute: number, station: (typeof stations)[number]) => void;
  onJourney: () => void;
}) {
  const navigation = useStoryNavigation();
  if (!navigation) return null;
  const readings = navigation.library.saved.flatMap((visit) => {
    const moment = visit.position.moment;
    const station = stations.find(({ id }) => id === moment?.choice);
    if (visit.id !== "tonga" || !station || moment?.at === undefined) return [];
    const minute = Math.floor((moment.at - Date.parse(timeIso(0))) / 60_000);
    const value = pressureAt(station, minute);
    return value === null ? [] : [{ visit, moment, station, minute, value }];
  });
  const current = readings[0];
  return (
    <section className="tonga-evidence tonga-kept" aria-label="Kept Tonga readings">
      <div className="tonga-evidence-body" data-evidence-body="">
        <div className="tonga-evidence-meta">
          <span>
            {readings.length} {readings.length === 1 ? "reading" : "readings"} kept on this device
          </span>
        </div>
        <h2>Kept from Tonga.</h2>
        {!readings.length && <p>Keep a station reading to return to it here.</p>}
        <div className="tonga-kept-list">
          {readings.map(({ visit, station, minute, value }) => (
            <button
              key={savedVisitKey(visit)}
              type="button"
              onClick={() => onInspect(minute, station)}
              aria-label={`Inspect ${station.name} at ${timeLabel(minute)} UTC`}
            >
              <span>
                {station.name}
                <small>15 Jan 2022 · {timeLabel(minute)} UTC</small>
              </span>
              <strong>{value.toFixed(2)} hPa</strong>
            </button>
          ))}
        </div>
        <p className="tonga-evidence-source">
          <a
            href="https://mesonet.agron.iastate.edu/request/asos/1min.phtml"
            target="_blank"
            rel="noreferrer"
          >
            ASOS / Iowa Environmental Mesonet
          </a>
          <br />
          One-minute station pressure
        </p>
        <p className="tonga-evidence-source" role="status" aria-label="Kept pressure status">
          {navigation.library.notice}
        </p>
      </div>
      <div className="tonga-evidence-actions">
        {current && (
          <ShareMoment label="Share finding" share={pressureShare} current={() => current.moment} />
        )}
        <button type="button" onClick={() => onInspect(stations[0]!.peak, stations[0]!)}>
          Keep another reading
        </button>
        <button type="button" onClick={onJourney}>
          Back to journey
        </button>
      </div>
    </section>
  );
}
