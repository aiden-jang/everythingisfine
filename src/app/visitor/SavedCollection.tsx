import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { visitEvidence } from "./visitEvidence";
import { EvidenceCard } from "./EvidenceCard";
import { savedVisitKey, type Visit } from "./library";
import { exportEvidence } from "./exportEvidence";

function KeptItem({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const navigation = useStoryNavigation()!;
  const evidence = visitEvidence(visit);
  const [note, setNote] = useState(visit.note ?? visit.observation?.note ?? "");
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const noteId = useId();
  return (
    <div className="kept-item">
      <EvidenceCard evidence={evidence} />
      <details className="kept-note">
        <summary>{note ? "Your note" : "Add a thought (optional)"}</summary>
        <label htmlFor={noteId}>What did you notice?</label>
        <textarea
          id={noteId}
          rows={3}
          maxLength={280}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
        <button
          type="button"
          onClick={() => {
            const { note: previous, ...rest } = visit;
            void previous;
            navigation.library.save({
              ...rest,
              note: note.trim(),
              ...(visit.observation ? { observation: { ...visit.observation, note: note.trim() } } : {}),
            });
          }}
        >
          Save note
        </button>
        <small>Only on this device. Notes are excluded from exported cards.</small>
      </details>
      <div className="kept-actions">
        <button
          type="button"
          disabled={!!navigation.unavailable(visit.id)}
          onClick={() => {
            onClose();
            navigation.resume(visit, "open-saved-observations");
          }}
        >
          Reopen this moment
        </button>
        <button
          type="button"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            setStatus("");
            try {
              await exportEvidence(evidence);
              setStatus("Evidence card downloaded.");
            } catch {
              setStatus("Couldn’t create the card. Your saved observation is still here.");
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? "Preparing card…" : "Download card"}
        </button>
        <button
          type="button"
          onClick={() => {
            navigation.library.remove(savedVisitKey(visit));
            requestAnimationFrame(() =>
              document.querySelector<HTMLElement>(".saved-collection h2")?.focus({ preventScroll: true }),
            );
          }}
          aria-label={`Remove saved ${evidence.title}`}
        >
          Remove
        </button>
      </div>
      <p role="status">{status}</p>
    </div>
  );
}

export function SavedCollection({ onClose }: { onClose: () => void }) {
  const navigation = useStoryNavigation();
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => heading.current?.focus({ preventScroll: true }), []);
  if (!navigation) return null;
  const { library } = navigation;
  return createPortal(
    <section
      id="saved-observations"
      className="saved-collection"
      aria-label="Saved observations"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="saved-collection-heading">
        <h2 ref={heading} tabIndex={-1}>
          What you noticed.
        </h2>
        <button type="button" onClick={onClose} aria-label="Close saved observations">
          Close
        </button>
      </div>
      <p>A place, a moment, something you noticed. Kept on this device.</p>
      {!library.saved.length && <p>Keep an observation or save a view in a story to find it here.</p>}
      <div className="saved-evidence-list">
        {library.saved.map((visit) => (
          <KeptItem key={savedVisitKey(visit)} visit={visit} onClose={onClose} />
        ))}
      </div>
      <div className="saved-feedback">
        <span role="status">{library.notice}</span>
        {library.canUndo && (
          <button type="button" onClick={library.undo}>
            Undo
          </button>
        )}
      </div>
      {library.recent.length > 0 && (
        <details className="saved-recent">
          <summary>Resume a recent journey</summary>
          {library.recent.map((visit) => (
            <button
              type="button"
              key={visit.id}
              onClick={() => {
                onClose();
                navigation.resume(visit, "open-saved-observations", true);
              }}
            >
              {visitEvidence(visit).title}
            </button>
          ))}
        </details>
      )}
    </section>,
    document.querySelector(".frame") ?? document.body,
  );
}
