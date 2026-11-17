import { useStoryNavigation } from "../journeys/StoryNavigation";
import { pressureAt, timeIso, timeLabel, type stations } from "./tongaTimeline";

export function KeepPressure({
  station,
  minute,
  map,
}: {
  station: (typeof stations)[number];
  minute: number;
  map: boolean;
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
          const previous = navigation.library.saved.find(({ id }) => id === "tonga");
          navigation.library.save({
            ...current,
            ...(previous?.note ? { note: previous.note } : {}),
            position: { moment: { id: "tonga", at: Date.parse(timeIso(minute)), choice: station.id, map } },
          });
        }}
      >
        {navigation.library.saved.some(({ id }) => id === "tonga")
          ? "Update kept observation"
          : "Keep this observation"}
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
