import { useState } from "react";
import { KeepMark } from "../visitor/KeepMark";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { pressureAt, timeIso, timeLabel, type stations } from "./tongaTimeline";

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
  const [lastAttempt, setLastAttempt] = useState<{ station: string; at: number } | null>(null);
  const reading = pressureAt(station, minute);
  if (!navigation) return null;
  const at = Date.parse(timeIso(Math.floor(minute)));
  const kept = navigation.library.saved.some(
    ({ id, position }) =>
      id === "tonga" &&
      position.moment?.choice === station.id &&
      position.moment.at !== undefined &&
      Math.floor(position.moment.at / 60_000) === Math.floor(at / 60_000),
  );
  return (
    <div className="visit-save">
      <button
        type="button"
        disabled={reading === null}
        aria-disabled={kept || reading === null}
        onClick={async () => {
          const current = navigation.current();
          if (kept || current?.id !== "tonga" || reading === null) return;
          setLastAttempt({ station: station.id, at });
          const { note, ...rest } = current;
          void note;
          const next = {
            ...rest,
            position: {
              moment: {
                id: "tonga",
                at,
                choice: station.id,
                chapter: "pressure",
                map,
              },
            },
          };
          if (await navigation.library.save(next)) onKept?.();
        }}
      >
        <KeepMark kept={kept} />
        {kept ? "Kept" : "Keep this reading"}
      </button>
      <span>
        {reading === null
          ? "Choose a minute with a recorded reading to keep it."
          : `${station.name} · ${timeLabel(minute)} UTC · ${reading.toFixed(2)} hPa`}
      </span>
      <span role="status" aria-label="Kept pressure status">
        {lastAttempt?.station === station.id && lastAttempt.at === at ? navigation.library.notice : ""}
      </span>
    </div>
  );
}
