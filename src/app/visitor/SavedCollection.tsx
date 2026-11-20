import { useId, useLayoutEffect, useState } from "react";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { restoreCollection } from "./collectionReturn";
import { visitEvidence } from "./visitEvidence";
import { EvidenceCard } from "./EvidenceCard";
import { savedVisitKey, type Visit } from "./library";

const noteDrafts = new Map<string, string>();

function KeptItem({ visit, onClose, returned }: { visit: Visit; onClose: () => void; returned: boolean }) {
  const navigation = useStoryNavigation()!;
  const evidence = visitEvidence(visit);
  const key = savedVisitKey(visit);
  const savedNote = visit.note ?? visit.observation?.note ?? "";
  const [draft, setDraft] = useState(() => noteDrafts.get(key));
  const note = draft ?? savedNote;
  const [noteStatus, setNoteStatus] = useState("");
  const hasDraft = note !== savedNote;
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const noteId = useId();
  return (
    <div className="kept-item" data-returned={returned || undefined}>
      <EvidenceCard evidence={evidence} />
      <details className="kept-note" id={`saved-note-${key}`}>
        <summary>
          {note ? "Your note" : "Add a thought (optional)"}
          {hasDraft && <span className="note-draft"> · Unsaved draft</span>}
        </summary>
        <label htmlFor={noteId}>What did you notice?</label>
        <textarea
          id={noteId}
          rows={3}
          maxLength={280}
          value={note}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setDraft(value === savedNote ? undefined : value);
            setNoteStatus("");
            if (value === savedNote) noteDrafts.delete(key);
            else noteDrafts.set(key, value);
          }}
        />
        <button
          type="button"
          aria-disabled={!hasDraft}
          onClick={async () => {
            if (!hasDraft) return;
            const value = note.trim();
            const saved = await navigation.library.editNote(key, value);
            setNoteStatus(saved ? "Note saved." : "Couldn’t save this note.");
            if (saved && noteDrafts.get(key)?.trim() === value) {
              setDraft(undefined);
              noteDrafts.delete(key);
            }
          }}
        >
          Save note
        </button>
        <span className="note-draft" role="status">
          {noteStatus || (hasDraft ? "Draft stays here while this tab is open." : "")}
        </span>
        <small>Only on this device. Notes are excluded from exported cards.</small>
      </details>
      <div className="kept-actions">
        <button
          type="button"
          id={`saved-entry-${key}`}
          disabled={!!navigation.unavailable(visit.id)}
          onClick={() => {
            navigation.resume(visit, `saved-entry-${key}`);
            onClose();
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
              const { exportEvidence } = await import("./exportEvidence");
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
            noteDrafts.delete(key);
            navigation.library.remove(key);
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
  const restore = navigation?.restoredCollection;
  useLayoutEffect(() => {
    if (!restore) return;
    const panel = document.getElementById("saved-observations");
    if (panel instanceof HTMLDialogElement && !panel.open) {
      const id = requestAnimationFrame(() => restoreCollection(restore));
      return () => cancelAnimationFrame(id);
    }
    restoreCollection(restore);
  }, [restore]);
  if (!navigation) return null;
  const { library } = navigation;
  return (
    <>
      {!library.saved.length && (
        <div className="saved-empty">
          <p>Keep a reading from any story that offers one.</p>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigation.browse();
            }}
          >
            Browse stories
          </button>
        </div>
      )}
      <div className="saved-evidence-list">
        {library.saved.map((visit) => (
          <KeptItem
            key={savedVisitKey(visit)}
            visit={visit}
            onClose={onClose}
            returned={restore?.focus === `saved-entry-${savedVisitKey(visit)}`}
          />
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
        <details className="saved-recent" id="saved-recent-journeys">
          <summary>Recent journeys</summary>
          {library.recent.map((visit) => (
            <button
              type="button"
              id={`saved-entry-recent-${visit.id}`}
              key={visit.id}
              disabled={!!navigation.unavailable(visit.id)}
              onClick={() => {
                navigation.resume(visit, `saved-entry-recent-${visit.id}`, true);
                onClose();
              }}
            >
              {visitEvidence(visit).title}
            </button>
          ))}
        </details>
      )}
    </>
  );
}
