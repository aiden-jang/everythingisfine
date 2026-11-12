import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { recordClip, clipType, CLIP_SECONDS } from "./clipRecorder";
import type { StillCaption, StillTheme } from "../still";
import { downloadStill } from "../stillDelivery";
import { reportAnalytics } from "../../../analytics/browser";

type Result = { file: File; url: string };
export function useClip(
  capture: MutableRefObject<() => HTMLCanvasElement | null>,
  caption: () => StillCaption,
  theme: () => StillTheme,
  ready: boolean,
  viewKey: string,
) {
  const recorder = useRef<ReturnType<typeof recordClip> | null>(null);
  const reader = useRef({ caption, theme });
  reader.current = { caption, theme };
  const [recording, setRecording] = useState(false);
  const [remaining, setRemaining] = useState(CLIP_SECONDS);
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState("");
  const resultRef = useRef<Result | null>(null);
  const [supported] = useState(
    () => !!clipType() && typeof HTMLCanvasElement.prototype.captureStream === "function",
  );
  const clearResult = useCallback(() => {
    if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    resultRef.current = null;
    setResult(null);
  }, []);
  const cancel = useCallback(() => {
    recorder.current?.cancel();
    recorder.current = null;
    setRecording(false);
  }, []);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && recorder.current) {
        cancel();
        setNotice("Recording stopped when you left the tab. Start another clip when you’re ready.");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      recorder.current?.cancel();
      recorder.current = null;
      document.removeEventListener("visibilitychange", hidden);
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    };
  }, [cancel]);
  useEffect(() => {
    if (recorder.current) {
      cancel();
      setNotice("The view changed. Start a new clip in this view.");
    }
  }, [ready, viewKey, cancel]);
  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const timer = window.setInterval(
      () => setRemaining(Math.max(0, CLIP_SECONDS - Math.floor((Date.now() - started) / 1000))),
      250,
    );
    return () => clearInterval(timer);
  }, [recording]);
  const onFrame = useCallback((source: HTMLCanvasElement) => recorder.current?.frame(source), []);
  let shareable = false;
  try {
    shareable = !!result && !!navigator.share && !!navigator.canShare?.({ files: [result.file] });
  } catch {
    /* A browser may refuse the capability probe. Downloads remain available. */
  }
  return {
    recording,
    remaining,
    result,
    notice,
    supported,
    onFrame,
    start() {
      if (recorder.current || !ready || !supported) return;
      clearResult();
      setNotice("");
      setRemaining(CLIP_SECONDS);
      try {
        const source = capture.current();
        if (!source) throw new Error("Globe unavailable");
        recorder.current = recordClip({
          source,
          caption: () => reader.current.caption(),
          theme: reader.current.theme(),
          complete(file) {
            recorder.current = null;
            setRecording(false);
            const next = { file, url: URL.createObjectURL(file) };
            resultRef.current = next;
            setResult(next);
            reportAnalytics({ name: "clip_created" });
          },
          failed() {
            recorder.current = null;
            setRecording(false);
            setNotice("Couldn’t record this clip. Try Save image instead.");
          },
        });
        setRecording(true);
      } catch {
        setNotice("Recording is unavailable in this browser. Try Save image instead.");
      }
    },
    stop() {
      recorder.current?.stop();
    },
    cancel() {
      cancel();
      setNotice("Recording cancelled.");
    },
    dismiss() {
      clearResult();
      setNotice("");
    },
    download() {
      if (result) {
        try {
          downloadStill(result.file);
        } catch {
          setNotice("The download could not start. Try again.");
        }
      }
    },
    share:
      result && shareable
        ? () => {
            void navigator.share({ files: [result.file] }).catch((error: unknown) => {
              if (!(error instanceof DOMException && error.name === "AbortError"))
                setNotice("Sharing is unavailable. Download the clip instead.");
            });
          }
        : null,
  };
}
export type Clip = ReturnType<typeof useClip>;
