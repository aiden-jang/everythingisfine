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
      <button className={className} type="button" aria-haspopup="dialog" onClick={show}>
        {label}
      </button>
      <dialog
        ref={dialog}
        className="archive-scene-dialog"
        aria-labelledby={id}
        onClose={() => {
          if (!dialog.current?.open) setOpen(false);
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <header className="archive-scene-header">
          <div>
            <h2 id={id}>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="archive-scene-button" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </header>
        {open &&
          (Stage ? (
            <Stage />
          ) : (
            <p className="archive-scene-loading" role="status">
              {stage === "error"
                ? "This scene couldn’t load. Reload the page to try again."
                : "Loading the archive scene…"}
            </p>
          ))}
        <footer className="archive-scene-credits">{credits}</footer>
      </dialog>
    </>
  );
}
