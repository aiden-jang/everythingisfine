import { useId, useState, useSyncExternalStore } from "react";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import type { FloatDiveView } from "./floatPlayback";

function ObservationEditor({ view, sampleIndex }: { view: FloatDiveView; sampleIndex?: number | undefined }) {
  const navigation = useStoryNavigation();
  const { index } = useSyncExternalStore(view.subscribe, view.read);
  const profile = `${view.source}/${view.profile.id}`;
  const kept = navigation?.library.saved.find(({ id }) => id === "float");
  const [note, setNote] = useState(() =>
    kept?.position.float?.profile === profile ? (kept.observation?.note ?? "") : "",
  );
  const noteId = useId();
  if (!navigation || navigation.active !== "float") return null;
  const sample = view.profile.samples[sampleIndex ?? index]!;

  return (
    <section className="float-observation" aria-label="Keep an observation">
      <div>
        <button
          type="button"
          onClick={() => {
            const current = navigation.current();
            const index = sampleIndex ?? view.read().index;
            const reading = view.profile.samples[index];
            if (current?.id !== "float" || !reading) return;
            navigation.library.save({
              ...current,
              position: {
                ...current.position,
                float: {
                  profile,
                  index,
                  ...(current.position.float?.map === true ? { map: true } : {}),
                },
              },
              observation: {
                at: view.profile.at,
                depth: reading.depth,
                temperature: reading.temperature,
                salinity: reading.salinity,
                ...(note.trim() ? { note: note.trim() } : {}),
              },
            });
          }}
        >
          {kept ? "Update kept observation" : "Keep this observation"}
        </button>
        <small>
          {Math.round(sample.depth).toLocaleString()} m · {sample.temperature.toFixed(2)} °C ·{" "}
          {sample.salinity.toFixed(3)} salinity
        </small>
      </div>
      <details className="float-observation-note">
        <summary>Add a note (optional)</summary>
        <label htmlFor={noteId}>
          A note for this observation <span>(optional)</span>
        </label>
        <textarea
          id={noteId}
          value={note}
          maxLength={280}
          rows={2}
          onChange={(event) => setNote(event.currentTarget.value.slice(0, 280))}
          placeholder="What did you notice?"
        />
        <p>Notes stay on this device. {note.length}/280 characters.</p>
      </details>
      <span role="status" aria-label="Kept observation status">
        {navigation.library.notice}
      </span>
    </section>
  );
}

export function FloatObservation({
  view,
  sampleIndex,
}: {
  view: FloatDiveView;
  sampleIndex?: number | undefined;
}) {
  return (
    <ObservationEditor key={`${view.source}/${view.profile.id}`} view={view} sampleIndex={sampleIndex} />
  );
}
