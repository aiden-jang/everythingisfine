import type { ButtonHTMLAttributes, Ref } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> & {
  playing: boolean;
  ended?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
};

export function PlaybackButton({ playing, ended = false, buttonRef, className = "", ...props }: Props) {
  return (
    <button
      {...props}
      ref={buttonRef}
      type="button"
      className={`story-playback ${className}`}
      data-playback-start={!playing || undefined}
    >
      <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
        {playing ? (
          <path d="M5 3h3v14H5zm7 0h3v14h-3z" fill="currentColor" />
        ) : ended ? (
          <path d="M4 7a7 7 0 1 1-1 5M4 2v5h5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        ) : (
          <path d="m6 3 11 7-11 7z" fill="currentColor" />
        )}
      </svg>
      {playing ? "Pause" : ended ? "Replay" : "Play"}
    </button>
  );
}
