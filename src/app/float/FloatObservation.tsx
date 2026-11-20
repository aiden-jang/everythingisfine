import { useId, useState } from "react";
import { KeepMark } from "../visitor/KeepMark";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import type { FloatDiveView } from "./floatPlayback";

function ObservationEditor({ view, sampleIndex }: { view: FloatDiveView; sampleIndex?: number | undefined }) {
  const navigation = useStoryNavigation();
  const profile = `${view.source}/${view.profile.id}`;
  const index = sampleIndex ?? view.read().index;
  const kept = navigation?.library.saved.find(
    ({ id, position }) =>
      id === "float" && position.float?.profile === profile && position.float.index === index,
  );
  const savedNote = kept?.note ?? kept?.observation?.note ?? "";
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [lastAttempt, setLastAttempt] = useState<number | null>(null);
  const note = drafts[index] ?? savedNote;
  const changed = note.trim() !== savedNote;
  const noteId = useId();
  if (!navigation || navigation.active !== "float") return null;
  const sample = sampleIndex === undefined ? undefined : view.profile.samples[sampleIndex];

  return (
    <section className="float-observation" aria-label="Keep an observation">
      <div>
        <button
          type="button"
          aria-disabled={Boolean(kept && !changed)}
          onClick={() => {
            if (kept && !changed) return;
            const current = navigation.current();
            view.pause();
            const reading = view.profile.samples[index];
            if (current?.id !== "float" || !reading) return;
            setLastAttempt(index);
            const saved = navigation.library.save({
              ...current,
              note: note.trim(),
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
            if (saved && drafts[index] !== undefined) {
              setDrafts((previous) => {
                const next = { ...previous };
                delete next[index];
                return next;
              });
            }
          }}
        >
          <KeepMark kept={!!kept} />
          {kept
            ? changed
              ? "Save note"
              : "Kept"
            : sample
              ? `Keep the ${Math.round(sample.depth).toLocaleString()} m reading`
              : "Keep this observation"}
        </button>
        {sample && (
          <small>
            {Math.round(sample.depth).toLocaleString()} m · {sample.temperature.toFixed(2)} °C ·{" "}
            {sample.salinity.toFixed(3)} salinity
          </small>
        )}
      </div>
      <details className="float-observation-note">
        <summary onClick={() => view.pause()}>{savedNote ? "Your note" : "Add a note (optional)"}</summary>
        <label htmlFor={noteId}>
          A note for this observation <span>(optional)</span>
        </label>
        <textarea
          id={noteId}
          value={note}
          maxLength={280}
          rows={2}
          onFocus={() => view.pause()}
          onChange={(event) => {
            const text = event.currentTarget.value.slice(0, 280);
            setDrafts((previous) => ({ ...previous, [index]: text }));
          }}
          placeholder="What did you notice?"
        />
        <p>Notes stay on this device. {note.length}/280 characters.</p>
      </details>
      <span role="status" aria-label="Kept observation status">
        {lastAttempt === index ? navigation.library.notice : ""}
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
