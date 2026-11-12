import { useEffect, useLayoutEffect, useRef } from "react";
import type { Clip } from "./useClip";
import "./clip.css";

export function RecordButton({ clip, ready, close }: { clip: Clip; ready: boolean; close?: () => void }) {
  return (
    <>
      <button
        type="button"
        disabled={!ready || !clip.supported || clip.recording}
        onClick={() => {
          close?.();
          clip.start();
        }}
      >
        Record 10-second clip
      </button>
      <p className="clip-hint">
        {clip.supported
          ? "Record, then replay or scrub this view. Silent video with its source and date."
          : "Video recording is unavailable in this browser. Save image still works."}
      </p>
    </>
  );
}
export function ClipNotice({ clip }: { clip: Clip }) {
  const panel = useRef<HTMLElement>(null);
  const visible = clip.recording || !!clip.result || !!clip.notice;
  const requested = useRef(false);
  const download = useRef<HTMLButtonElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (visible) panel.current?.showPopover();
  }, [visible]);
  useEffect(() => {
    if (requested.current && !clip.recording) {
      (download.current ?? dismiss.current)?.focus({ preventScroll: true });
      requested.current = false;
    }
  }, [clip.recording, clip.result, clip.notice]);
  if (!visible) return null;
  return (
    <section ref={panel} {...{ popover: "manual" }} className="clip-notice" aria-label="Video clip">
      {clip.recording ? (
        <>
          <p role="status">Recording · {clip.remaining}s left</p>
          <div>
            <button
              type="button"
              onClick={() => {
                requested.current = true;
                clip.stop();
              }}
            >
              Stop recording
            </button>
            <button
              type="button"
              onClick={() => {
                requested.current = true;
                clip.cancel();
              }}
            >
              Cancel recording
            </button>
          </div>
        </>
      ) : (
        <>
          {clip.result && (
            <>
              <p role="status">Clip ready</p>
              <video
                controls
                playsInline
                src={clip.result.url}
                aria-label="Recorded globe clip"
                preload="metadata"
              />
              <div>
                <button type="button" ref={download} onClick={clip.download}>
                  Download clip
                </button>
                {clip.share && (
                  <button type="button" onClick={clip.share}>
                    Share clip
                  </button>
                )}
              </div>
            </>
          )}
          {clip.notice && <p role="status">{clip.notice}</p>}
          <button
            type="button"
            ref={dismiss}
            onClick={() => {
              clip.dismiss();
              requestAnimationFrame(() =>
                ["observatory-options", "capture-still", "utility-toggle"]
                  .map((id) => document.getElementById(id))
                  .find((node) => node?.checkVisibility())
                  ?.focus(),
              );
            }}
          >
            Dismiss clip
          </button>
        </>
      )}
    </section>
  );
}
