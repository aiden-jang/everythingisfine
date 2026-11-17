import { useStoryNavigation } from "../journeys/StoryNavigation";
import { pressureAt, timeIso, timeLabel, type stations } from "./tongaTimeline";
import { savedVisitKey } from "../visitor/library";

export function KeepPressure({
  station,
  minute,
  map,
  onKept,
}: {
  station: (typeof stations)[number];
  minute: number;
  map: boolean;
  onKept?: () => void;
}) {
  const navigation = useStoryNavigation();
  const reading = pressureAt(station, minute);
  if (!navigation) return null;
  return (
    <div className="visit-save">
      <button
        type="button"
        disabled={reading === null}
        onClick={() => {
          const current = navigation.current();
          if (current?.id !== "tonga" || reading === null) return;
          const { note, ...rest } = current;
          void note;
          const next = {
            ...rest,
            position: {
              moment: {
                id: "tonga",
                at: Date.parse(timeIso(Math.floor(minute))),
                choice: station.id,
                chapter: "pressure",
                map,
              },
            },
          };
          const previous = navigation.library.saved.find(
            (entry) => savedVisitKey(entry) === savedVisitKey(next),
          );
          if (navigation.library.save({ ...next, ...(previous?.note ? { note: previous.note } : {}) }))
            onKept?.();
        }}
      >
        Keep this reading
      </button>
      <span>
        {reading === null
          ? "Choose a minute with a recorded reading to keep it."
          : `${station.name} · ${timeLabel(minute)} UTC · ${reading.toFixed(2)} hPa`}
      </span>
      <span role="status" aria-label="Kept pressure status">
        {navigation.library.notice}
      </span>
    </div>
  );
}
