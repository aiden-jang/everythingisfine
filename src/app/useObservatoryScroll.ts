import { useLayoutEffect, useRef, type RefObject, type MutableRefObject } from "react";

export function useObservatoryScroll(
  controls: RefObject<HTMLElement>,
  scroll: MutableRefObject<number>,
  browsing: boolean,
  view: string,
) {
  const reveal = useRef(false);
  useLayoutEffect(() => {
    controls.current?.scrollTo(0, browsing ? (scroll.current ?? 0) : 0);
    controls.current?.querySelector<HTMLElement>(".observatory-story")?.scrollTo(0, 0);
    // Opening the default library must not scroll past the introduction; an explicit choice should reveal it.
    if (browsing && reveal.current) {
      reveal.current = false;
      controls.current?.querySelector<HTMLInputElement>('input[name="story"]')?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [controls, scroll, browsing, view]);
  return () => {
    scroll.current = 0;
    reveal.current = true;
  };
}
