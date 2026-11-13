import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useReadingArrival } from "./useReadingArrival";
import type { ObservatoryProps } from "./Observatory";
import { Discoveries } from "./visitor/Discoveries";
import { StoriesDrawer } from "./StoriesDrawer";
import { ObservatoryScenePicker } from "./ObservatoryStage";
import "./explorer.css";

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
  const panel = useRef<HTMLDivElement>(null);
  useReadingArrival(panel, browser.pane);
  const scrolls = useRef({ layers: 0, stories: 0 });
  const previous = useRef(browser.pane);
  useLayoutEffect(() => {
    if (previous.current === browser.pane) return;
    const rail = document.getElementById("chrome-rail");
    if (rail) rail.scrollTop = scrolls.current[browser.pane];
    previous.current = browser.pane;
  }, [browser.pane]);
  const select = (pane: "layers" | "stories") => {
    scrolls.current[browser.pane] = document.getElementById("chrome-rail")?.scrollTop ?? 0;
    browser.show(pane);
  };
  return (
    <>
      <div className="explorer-tabs" role="tablist" aria-label="Explore panel">
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
      {notices}
      <div
        ref={browser.pane === "layers" ? panel : undefined}
        id="explorer-layers"
        role="tabpanel"
        aria-labelledby="explorer-layers-tab"
        hidden={browser.pane !== "layers"}
      >
        {children}
      </div>
      <div
        ref={browser.pane === "stories" ? panel : undefined}
        id="explorer-stories"
        role="tabpanel"
        aria-labelledby="explorer-stories-tab"
        hidden={browser.pane !== "stories"}
      >
        <h2 className="sr-only">Stories</h2>
        {!context.views.observing && (
          <ObservatoryScenePicker
            scene={browser.category}
            ready={context.ready}
            deepAvailable={context.deepAvailable}
            onScene={(next) => browser.select(browser.category === next ? null : next)}
          />
        )}
        <StoriesDrawer
          browse={browser}
          visible={!context.views.observing}
          scene={browser.category}
          ready={context.ready}
          observations={observations}
          aurora={context.aurora}
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
            type="button"
            onClick={context.tour.start}
            disabled={!context.tour.available || !context.ready}
          >
            Take a tour
          </button>
        </StoriesDrawer>
      </div>
    </>
  );
}
