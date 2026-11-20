import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useReadingArrival } from "./useReadingArrival";
import { flushSync } from "react-dom";
import { shiftGlobe } from "./presentationMotion";
import { globeFramingRect } from "../globe/globeFraming";
import type { ObservatoryProps } from "./Observatory";
import { Discoveries } from "./visitor/Discoveries";
import { StoriesDrawer } from "./StoriesDrawer";
import { OBSERVATORY_SCENES } from "./ObservatoryStage";
import { SceneDiagram } from "./SceneDiagram";
import { resetStoryResults } from "./StorySearch";
import { useStoryNavigation } from "./journeys/StoryNavigation";
import { reportAnalytics } from "../../analytics/browser";
import "./explore-panel.css";

export function ExplorerFold({ open, onChange }: { open: boolean; onChange: (open: boolean) => void }) {
  function fold() {
    const scene = document.querySelector<HTMLElement>("#globe-view .globe-scene");
    if (!scene?.animate || document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onChange(!open);
      return;
    }
    const from = globeFramingRect(scene);
    scene
      .getAnimations()
      .find((motion) => motion.id === "globe-fold")
      ?.cancel();
    flushSync(() => onChange(!open));
    shiftGlobe(scene, from, "globe-fold");
  }
  return (
    <button
      type="button"
      className="explorer-fold"
      onClick={fold}
      aria-label={open ? "Hide the panel" : "Show the panel"}
      aria-expanded={open}
      aria-controls="chrome-rail"
    >
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
        <path
          d="m12 6-4 4 4 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function ExplorerSidebar({
  context,
  children,
  notices,
}: {
  context: ObservatoryProps;
  children: ReactNode;
  notices: ReactNode;
}) {
  const { browser, observations } = context.views;
  const scene = OBSERVATORY_SCENES.find(({ id }) => id === browser.category);
  const navigation = useStoryNavigation();
  const panel = useRef<HTMLDivElement>(null);
  useReadingArrival(panel, browser.pane, "fade");
  const scrolls = useRef({ layers: 0, stories: 0 });
  const previous = useRef(browser.pane);
  useLayoutEffect(() => {
    const rail = document.getElementById("chrome-rail");
    if (!rail) return;
    let idle = 0;
    const markScroll = () => {
      rail.toggleAttribute("data-scrolled", rail.scrollTop > 0);
      rail.setAttribute("data-scrolling", "");
      clearTimeout(idle);
      idle = window.setTimeout(() => rail.removeAttribute("data-scrolling"), 650);
    };
    rail.toggleAttribute("data-scrolled", rail.scrollTop > 0);
    rail.addEventListener("scroll", markScroll, { passive: true });
    return () => {
      rail.removeEventListener("scroll", markScroll);
      rail.removeAttribute("data-scrolling");
      clearTimeout(idle);
    };
  }, []);
  const layerView = useRef<{ camera: ReturnType<typeof context.explorer.read>; flat: boolean } | null>(null);
  useLayoutEffect(() => {
    if (previous.current === browser.pane) return;
    if (browser.pane === "stories")
      layerView.current = { camera: context.explorer.read(), flat: context.explorer.flat };
    else if (layerView.current) {
      context.explorer.restore(layerView.current.camera, layerView.current.flat);
      layerView.current = null;
    }
    const rail = document.getElementById("chrome-rail");
    if (rail) rail.scrollTop = scrolls.current[browser.pane];
    previous.current = browser.pane;
  }, [browser.pane, context.explorer]);
  const select = (pane: "layers" | "stories") => {
    scrolls.current[browser.pane] = document.getElementById("chrome-rail")?.scrollTop ?? 0;
    browser.show(pane);
  };
  return (
    <>
      <div className="explorer-tabs" role="tablist" aria-label="Explore panel">
        <div className="explorer-tab-options" data-pane={browser.pane} role="presentation">
          {(["layers", "stories"] as const).map((pane) => (
            <button
              key={pane}
              id={`explorer-${pane}-tab`}
              type="button"
              role="tab"
              aria-selected={browser.pane === pane}
              aria-controls={`explorer-${pane}`}
              tabIndex={browser.pane === pane ? 0 : -1}
              onClick={() => select(pane)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "layers"
                    : event.key === "End"
                      ? "stories"
                      : pane === "layers"
                        ? "stories"
                        : "layers";
                select(next);
                document.getElementById(`explorer-${next}-tab`)?.focus({ preventScroll: true });
              }}
            >
              {pane === "layers" ? "Layers" : "Stories"}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={browser.pane === "layers" ? panel : undefined}
        id="explorer-layers"
        role="tabpanel"
        aria-labelledby="explorer-layers-tab"
        hidden={browser.pane !== "layers"}
      >
        {children}
        {notices}
      </div>
      <div
        ref={browser.pane === "stories" ? panel : undefined}
        id="explorer-stories"
        role="tabpanel"
        aria-labelledby="explorer-stories-tab"
        hidden={browser.pane !== "stories"}
      >
        <h2 className="sr-only">Stories</h2>
        <StoriesDrawer
          browse={browser}
          visible={!context.views.observing}
          scene={browser.category}
          sceneEntry={
            scene && (
              <button
                type="button"
                id="open-story-category-scene"
                className="story-scene-entry"
                disabled={!context.ready}
                onClick={() => {
                  reportAnalytics({ name: "scene_selected", scene: scene.id });
                  context.views.observeScene(() => {
                    observations.setQuery("");
                    context.onScene(scene.id);
                  });
                  document
                    .querySelector<HTMLElement>('#observatory-scenes button[aria-pressed="true"]')
                    ?.focus({ preventScroll: true });
                }}
              >
                Open {scene.name} scene
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            )
          }
          filter={
            <div className="story-category" role="group" aria-label="Story categories">
              {[{ id: null, name: "All topics" }, ...OBSERVATORY_SCENES].map(({ id, name }) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={browser.category === id}
                  onClick={(event) => {
                    resetStoryResults(event.currentTarget);
                    browser.select(browser.category === id ? null : id);
                  }}
                >
                  <SceneDiagram scene={id} />
                  <span>{name}</span>
                </button>
              ))}
            </div>
          }
          ready={context.ready}
          observations={observations}
          discoveries={
            <Discoveries
              data={context.discoveries}
              aurora={context.aurora}
              city={context.views.skyCity.city}
            />
          }
          onHistory={context.onHistory}
          onPickDate={context.onPickDate}
          onSelect={() => {
            browser.scroll.current = document.getElementById("chrome-rail")?.scrollTop ?? 0;
          }}
          onDismiss={() => {
            select("layers");
            document.getElementById("explorer-layers-tab")?.focus();
          }}
        >
          <button
            id="start-story-tour"
            type="button"
            onClick={() => navigation?.tour()}
            disabled={!context.tour.available || !context.ready}
          >
            Take a tour
          </button>
        </StoriesDrawer>
      </div>
    </>
  );
}
