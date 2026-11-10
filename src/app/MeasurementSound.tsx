import { useEffect, useRef, useState } from "react";
import { createMeasurementVoice } from "./measurementVoice";

export function MeasurementSound({
  value,
  min,
  max,
  label,
  explanation,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  explanation: string;
}) {
  const voice = useRef<ReturnType<typeof createMeasurementVoice> | null>(null);
  const [state, setState] = useState<"off" | "starting" | "on" | "unavailable">("off");
  useEffect(() => {
    if (state === "on") voice.current?.play(value, min, max);
  }, [state, value, min, max]);
  useEffect(() => {
    const silence = () => {
      if (!document.hidden) return;
      voice.current?.close();
      voice.current = null;
      setState("off");
    };
    document.addEventListener("visibilitychange", silence);
    return () => {
      document.removeEventListener("visibilitychange", silence);
      voice.current?.close();
      voice.current = null;
    };
  }, []);
  async function toggle() {
    if (voice.current) {
      voice.current.close();
      voice.current = null;
      setState("off");
      return;
    }
    setState("starting");
    let pending: ReturnType<typeof createMeasurementVoice> | null = null;
    try {
      pending = createMeasurementVoice();
      voice.current = pending;
      await pending.ready;
      if (voice.current === pending) setState("on");
    } catch {
      pending?.close();
      if (voice.current === pending) {
        voice.current = null;
        setState("unavailable");
      }
    }
  }
  return (
    <div className="measurement-sound">
      <button
        type="button"
        aria-pressed={state === "on"}
        disabled={state === "starting"}
        onClick={() => void toggle()}
      >
        {state === "starting" ? "Starting sound…" : `${state === "on" ? "Mute" : "Listen to"} ${label}`}
      </button>
      <small>{explanation} Synthesized tones, not field recordings.</small>
      {state === "unavailable" && (
        <p role="status">Sound couldn’t start. You can try again or keep using the readings.</p>
      )}
    </div>
  );
}
