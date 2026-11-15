import { useEffect, useId, useRef, useState } from "react";
import { refreshAnnotations } from "../../globe/annotationInput";
import { requestDeviceLocation } from "./device";

export function DeviceLocation({ ready }: { ready: boolean }) {
  const [status, setStatus] = useState("");
  const note = useId();
  const stop = useRef<() => void>(() => {});
  const available = useRef(ready);
  available.current = ready;
  useEffect(() => () => stop.current(), []);
  useEffect(() => {
    if (!ready) stop.current();
  }, [ready]);
  return (
    <div>
      <div className="device-location-actions">
        <button
          type="button"
          className="place-locate"
          disabled={!ready}
          aria-describedby={note}
          onClick={() => {
            stop.current();
            stop.current = requestDeviceLocation((point) => {
              if (available.current) refreshAnnotations(point);
            }, setStatus);
          }}
        >
          Use device location
        </button>
        <a href="https://accounts.aidenjang.com/privacy#legal-location-in-everything-is-fine">
          Location privacy
        </a>
      </div>
      <p id={note}>Approximate area only.</p>
      <div role="status">{status && <p>{status}</p>}</div>
    </div>
  );
}
