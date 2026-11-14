import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { createPortal } from "react-dom";
import { storyPlace, type StoryPlace } from "./places";
import { refreshAnnotations } from "../../globe/annotationInput";
import "./discovery.css";

const Preview = createContext<((place: StoryPlace, trigger?: HTMLElement) => void) | null>(null);
export function StoryPreviewButton({ id, title }: { id: string; title: string }) {
  const locate = useContext(Preview);
  const navigation = useStoryNavigation();
  const place = storyPlace(id);
  if (!place || !locate) return null;
  return (
    <button
      type="button"
      data-story-preview=""
      className="story-preview-action"
      aria-label={`Preview ${title}`}
      disabled={!!navigation?.unavailable(id)}
      onClick={(event) => locate(place, event.currentTarget)}
    >
      Preview
    </button>
  );
}

export function StoryPreview({ children, scope }: { children: ReactNode; scope: string }) {
  const navigation = useStoryNavigation();
  const latest = useRef(navigation);
  latest.current = navigation;
  const [pinned, setPinned] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => () => latest.current?.preview(), []);
  const touch = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout>; held: boolean } | null>(
    null,
  );
  const cancelTouch = () => {
    if (touch.current) clearTimeout(touch.current.timer);
  };
  useEffect(() => cancelTouch, []);
  const [place, setPlace] = useState<StoryPlace | null>(null);
  const browsing = navigation?.browsingStories;
  useLayoutEffect(() => {
    setPinned(false);
    setPlace(null);
    latest.current?.preview(undefined, !!browsing);
  }, [scope, browsing]);
  useLayoutEffect(() => refreshAnnotations(), [place]);
  const dismiss = (restoreFocus = false) => {
    setPinned(false);
    setPlace(null);
    navigation?.preview();
    if (restoreFocus && trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
  };
  const locate = (region: StoryPlace, button?: HTMLElement) => {
    if (button) trigger.current = button;
    setPinned(true);
    setPlace(region);
    navigation?.preview(region);
  };
  const preview = (target: EventTarget | null) => {
    if (pinned) return;
    if (target instanceof Element && target.closest(".discovery-preview")) return;
    const button = target instanceof Element ? target.closest("button[id]") : null;
    setPlace(button ? (storyPlace(button.id) ?? null) : null);
  };
  const stage = document.querySelector(".zones");
  return (
    <Preview.Provider value={locate}>
      <div
        onPointerOver={(event) => {
          if (event.pointerType !== "touch") preview(event.target);
        }}
        onFocusCapture={(event) => {
          if (!touch.current) preview(event.target);
        }}
        onPointerDown={(event) => {
          if (
            event.pointerType !== "touch" ||
            (event.target instanceof Element && event.target.closest("[data-story-preview]"))
          )
            return;
          const button = event.target instanceof Element ? event.target.closest("button[id]") : null;
          const region = button ? storyPlace(button.id) : null;
          cancelTouch();
          touch.current = null;
          if (!region) return;
          touch.current = {
            x: event.clientX,
            y: event.clientY,
            held: false,
            timer: setTimeout(() => {
              if (touch.current) {
                touch.current.held = true;
                setPlace(region);
              }
            }, 400),
          };
        }}
        onPointerMove={(event) => {
          const start = touch.current;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancelTouch();
        }}
        onPointerUp={cancelTouch}
        onPointerCancel={() => {
          cancelTouch();
          touch.current = null;
        }}
        onContextMenu={(event) => {
          if (touch.current?.held) event.preventDefault();
        }}
        onPointerLeave={(event) => {
          cancelTouch();
          if (
            !pinned &&
            !(event.relatedTarget instanceof Element && event.relatedTarget.closest(".discovery-preview")) &&
            !document.activeElement?.closest("#stories-panel")
          )
            setPlace(null);
        }}
        onBlurCapture={(event) => {
          if (
            !pinned &&
            !event.currentTarget.contains(event.relatedTarget as Node) &&
            !(event.relatedTarget instanceof Element && event.relatedTarget.closest(".discovery-preview"))
          )
            setPlace(null);
        }}
        onKeyDownCapture={(event) => {
          if (event.key === "Escape" && place && pinned) {
            event.preventDefault();
            event.stopPropagation();
            dismiss(true);
          }
        }}
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest("[data-story-preview]")) {
            touch.current = null;
            return;
          }
          if (touch.current?.held) {
            event.preventDefault();
            event.stopPropagation();
          } else if (!(event.target instanceof Element && event.target.closest(".discovery-preview"))) {
            const button = event.target instanceof Element ? event.target.closest("button[id]") : null;
            if (button && /^(open-|search-story-|continue-story)/.test(button.id)) {
              setPinned(false);
              setPlace(null);
            } else dismiss();
          }
          touch.current = null;
        }}
      >
        {children}
        {place &&
          stage &&
          createPortal(
            <div className="discovery-preview" aria-label="Story location preview">
              <span
                className="discovery-pin"
                data-observation-anchor=""
                data-lon={place.lon}
                data-lat={place.lat}
                aria-hidden="true"
              >
                <i />
                {place.label}
              </span>
              <div className="discovery-preview-caption">
                <span>
                  {place.label}
                  <small>Story region · preview</small>
                </span>
                {!pinned && (
                  <button type="button" onClick={() => locate(place)}>
                    Locate
                  </button>
                )}
                <button type="button" aria-label="Dismiss location preview" onClick={() => dismiss(true)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="m3 3 10 10M13 3 3 13" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
              </div>
            </div>,
            stage,
          )}
      </div>
    </Preview.Provider>
  );
}
