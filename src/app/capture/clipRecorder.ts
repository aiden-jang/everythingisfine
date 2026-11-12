import { drawStill, STILL_WIDTH, STILL_HEIGHT, type StillCaption, type StillTheme } from "../still";

export const CLIP_SECONDS = 10;
export const clipType = () =>
  typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function"
    ? null
    : ([
        "video/mp4;codecs=avc1.42E01E",
        "video/mp4",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type)) ?? null);

// Copy the live drawing buffer before compositing. See ARCHITECTURE.md#srcappcapturecliprecorderts.
export function recordClip({
  source,
  caption,
  theme,
  complete,
  failed,
}: {
  source: HTMLCanvasElement;
  caption: () => StillCaption;
  theme: StillTheme;
  complete: (file: File) => void;
  failed: () => void;
}) {
  const mimeType = clipType();
  if (!mimeType || !source.captureStream) throw new Error("Recording unavailable");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.scale(canvas.width / STILL_WIDTH, canvas.height / STILL_HEIGHT);
  let last = -Infinity;
  let closed = false;
  let cancelled = false;
  const frame = (view: HTMLCanvasElement) => {
    const now = performance.now();
    if (closed || now - last < 1000 / 24) return;
    last = now;
    drawStill(ctx, view, view.width, view.height, caption(), theme);
  };
  frame(source);
  const stream = canvas.captureStream(24);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 });
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
  const chunks: Blob[] = [];
  let size = 0;
  let deadline = 0;
  let heartbeat = 0;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(deadline);
    clearInterval(heartbeat);
    stream.getTracks().forEach((track) => track.stop());
  };
  const stop = (discard = false) => {
    if (discard) cancelled = true;
    if (closed) return;
    closed = true;
    clearTimeout(deadline);
    clearInterval(heartbeat);
    if (recorder.state !== "inactive") recorder.stop();
    if (discard || recorder.state === "inactive") release();
  };
  recorder.ondataavailable = ({ data }) => {
    if (cancelled || !data.size) return;
    size += data.size;
    if (size > 12_000_000) {
      cancelled = true;
      stop(true);
      failed();
      return;
    }
    chunks.push(data);
  };
  recorder.onerror = () => {
    if (cancelled) return;
    stop(true);
    release();
    failed();
  };
  recorder.onstop = () => {
    release();
    if (cancelled) return;
    if (!size) {
      failed();
      return;
    }
    const type = recorder.mimeType || mimeType;
    complete(
      new File(chunks, `everything-is-fine-${Date.now()}.${type.includes("mp4") ? "mp4" : "webm"}`, { type }),
    );
  };
  try {
    recorder.start(250);
    // A static globe sleeps. Repaint the retained 2D frame without waking WebGL.
    heartbeat = window.setInterval(() => {
      ctx.save();
      ctx.resetTransform();
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
    }, 1000 / 24);
    deadline = window.setTimeout(() => stop(), CLIP_SECONDS * 1000);
  } catch (error) {
    cancelled = true;
    release();
    throw error;
  }
  return {
    frame(source: HTMLCanvasElement) {
      try {
        frame(source);
      } catch {
        stop(true);
        release();
        failed();
      }
    },
    stop,
    cancel: () => stop(true),
  };
}
