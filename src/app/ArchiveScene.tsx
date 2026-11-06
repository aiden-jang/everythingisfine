import { useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import "./archive-scene.css";

interface Props {
  label: string;
  title: string;
  subtitle: ReactNode;
  credits: ReactNode;
  load: () => Promise<ComponentType>;
  className?: string | undefined;
}

export function ArchiveScene({ label, title, subtitle, credits, load, className }: Props): JSX.Element {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<{ component: ComponentType } | "error" | null>(null);
  const Stage = stage && stage !== "error" ? stage.component : null;

  function show() {
    if (!dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    setOpen(true);
    if (!Stage) {
      setStage(null);
      void load().then(
        (component) => setStage({ component }),
        () => setStage("error"),
      );
    }
  }

  return (
    <>
      <button ref={trigger} className={className} type="button" aria-haspopup="dialog" onClick={show}>
        {label}
      </button>
      <dialog
        ref={dialog}
        className="archive-scene-dialog"
        aria-labelledby={id}
        aria-describedby={`${id}-summary`}
        onClose={() => {
          if (dialog.current?.open) return;
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <header className="archive-scene-header">
          <div>
            <h2 id={id}>{title}</h2>
            <p id={`${id}-summary`}>{subtitle}</p>
          </div>
          <button type="button" className="archive-scene-button" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </header>
        {open &&
          (Stage ? (
            <Stage />
          ) : (
            <div className="archive-scene-loading">
              <p role="status">{stage === "error" ? "This scene couldn’t load." : "Loading the scene…"}</p>
              {stage === "error" && (
                <button
                  type="button"
                  className="archive-scene-button"
                  onClick={() => window.location.reload()}
                >
                  Reload the app
                </button>
              )}
            </div>
          ))}
        <footer className="archive-scene-credits">{credits}</footer>
      </dialog>
    </>
  );
}
