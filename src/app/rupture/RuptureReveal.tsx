import { useId, useRef, useState, type ComponentType } from "react";
import "./rupture.css";

const EVENT = "https://earthquake.usgs.gov/earthquakes/eventpage/usc0001xgp";
export const TOHOKU_DAY = "2011-03-11";

export function RuptureReveal({ className }: { className?: string }): JSX.Element {
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
      void import("./RuptureStage").then(
        ({ RuptureStage }) => setStage({ component: RuptureStage }),
        () => setStage("error"),
      );
    }
  }

  return (
    <>
      <button className={className} type="button" aria-haspopup="dialog" onClick={show}>
        Watch Tōhoku rupture
      </button>
      <dialog
        ref={dialog}
        className="rupture-dialog"
        aria-labelledby={id}
        onClose={() => {
          if (!dialog.current?.open) setOpen(false);
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <header className="rupture-header">
          <div>
            <h2 id={id}>The Tōhoku rupture</h2>
            <p>
              <time dateTime="2011-03-11T05:46:24Z">11 Mar 2011 · 05:46:24 UTC</time>
              <span> M9.1 · 29 km deep</span>
            </p>
          </div>
          <button type="button" className="rupture-button" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </header>
        {open &&
          (Stage ? (
            <Stage />
          ) : (
            <p className="rupture-loading" role="status">
              {stage === "error"
                ? "The reveal couldn’t load. Close it to try again."
                : "Loading the USGS model…"}
            </p>
          ))}
        <footer className="rupture-credits">
          <a href={EVENT + "/finite-fault"} target="_blank" rel="noreferrer">
            USGS finite fault
          </a>
          <a href={EVENT + "/shakemap"} target="_blank" rel="noreferrer">
            USGS ShakeMap
          </a>
          <span>Coastlines by Natural Earth</span>
        </footer>
      </dialog>
    </>
  );
}
