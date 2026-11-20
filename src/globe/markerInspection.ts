import { magnitude } from "../app/format";
import { layerTime } from "../app/layerTime";
import type { MarkerHit } from "./quakePicking";
import { createMarkerPicker, type MarkerChoice } from "./markerPicker";
import type { Feed } from "../app/feed";
import { matches } from "../data/filter";
import type { GlobeProps } from "./GlobeProps";
import type { createGlobe } from "./scene";
import { isLocalView } from "./scenePresentation";
import { createTapGesture } from "./tapGesture";

const TOUCH_SLOP_PX = 18;

export type MarkerTarget = { kind: "quake" | "mark"; id: string };
type Scene = ReturnType<typeof createGlobe>;
type State = Pick<
  Required<GlobeProps>,
  "filters" | "inspection" | "globePresentation" | "landing" | "marks"
> &
  Pick<GlobeProps, "onPlace">;

export function attachMarkerInspection(
  canvas: HTMLCanvasElement,
  scene: Scene,
  feed: Feed,
  read: () => State,
  now: () => number,
  revealUntil: () => number | undefined,
  show: (target: MarkerTarget | null) => void,
  select: GlobeProps["onSelect"],
  selectMark: GlobeProps["onSelectMark"],
  interrupt: () => void,
) {
  const tap = createTapGesture();
  const listeners = new AbortController();
  let preview: MarkerTarget | null = null;
  let pending: MarkerTarget | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const landing = () => read().landing;
  const same = (a: MarkerTarget | null, b: MarkerTarget | null) => a?.id === b?.id && a?.kind === b?.kind;
  let touchChoice: MarkerTarget | null = null;
  const display = (target: MarkerTarget | null, touch = false) => {
    clearTimeout(timer);
    pending = null;
    if (same(preview, target) && Boolean(touchChoice) === touch) return;
    touchChoice = touch ? target : null;
    canvas.toggleAttribute("data-touch-preview", touchChoice !== null);
    preview = target;
    show(target);
  };
  const pick = (e: PointerEvent, slop?: number): MarkerTarget | null => {
    const quake = scene.hitTest(e.clientX, e.clientY, feed.store, read().filters, now(), slop);
    if (quake !== null) return { kind: "quake", id: quake };
    const mark = scene.hitMark(e.clientX, e.clientY, slop);
    return mark === null ? null : { kind: "mark", id: mark };
  };
  const open = (target: MarkerTarget) => {
    display(null);
    if (target.kind === "mark") selectMark?.(target.id);
    else {
      select(target.id);
      selectMark?.(null);
    }
  };
  const picker = createMarkerPicker(canvas, open, () => show(null), listeners.signal);
  const describe = (target: MarkerTarget): MarkerChoice | null => {
    if (target.kind === "quake") {
      const reading = feed.store.get(target.id)?.primary;
      return reading
        ? { target, place: `${magnitude(reading)} ${reading.place}`, time: layerTime(reading.time) }
        : null;
    }
    const mark = read().marks.find((candidate) => candidate.id === target.id && candidate.anchor);
    const place = mark?.caption ?? mark?.label;
    if (!place) return null;
    return { target, place, time: mark?.observationTime ?? "" };
  };
  const crowded = (e: PointerEvent, quakeHits: MarkerHit[], markHits: MarkerHit[]) => {
    const hits = [
      ...quakeHits.map(({ id, score }) => ({ target: { kind: "quake" as const, id }, score })),
      ...markHits.map(({ id, score }) => ({ target: { kind: "mark" as const, id }, score })),
    ].sort((a, b) => a.score - b.score);
    const choices: MarkerChoice[] = [];
    for (const { target } of hits) {
      if (choices.some((choice) => same(choice.target, target))) continue;
      const choice = describe(target);
      if (choice) choices.push(choice);
      if (choices.length === 3) break;
    }
    if (choices.length < 2) return false;
    display(null);
    return picker.show(e.clientX, e.clientY, choices);
  };
  const move = (e: PointerEvent) => {
    const dragging = tap.move(e);
    if (picker.open || read().inspection?.kind === "sequence") return;
    if (landing() && (dragging || e.buttons)) {
      if (dragging) display(null);
      return;
    }
    if (e.pointerType === "touch") return;
    const next = pick(e);
    if (!landing() || !next) return display(next);
    if (same(pending, next) || same(preview, next)) return;
    display(null);
    pending = next;
    timer = setTimeout(() => {
      if (landing()) display(pick(e));
    }, 140);
  };
  const down = (e: PointerEvent) => {
    if (isLocalView(read().globePresentation)) return;
    interrupt();
    tap.down(e);
  };
  const up = (e: PointerEvent) => {
    const morph = scene.controls.morph();
    if (!tap.up(e) || (morph > 0 && morph < 1)) return;
    const slop = e.pointerType === "mouse" ? undefined : TOUCH_SLOP_PX;
    const quakeHits: MarkerHit[] = [];
    const markHits: MarkerHit[] = [];
    const quake = scene.hitTest(e.clientX, e.clientY, feed.store, read().filters, now(), slop, quakeHits);
    const mark = scene.hitMark(e.clientX, e.clientY, slop, markHits);
    if (!e.shiftKey && crowded(e, quakeHits, markHits)) return;
    const target: MarkerTarget | null =
      quake !== null ? { kind: "quake", id: quake } : mark !== null ? { kind: "mark", id: mark } : null;
    if (landing() && e.pointerType !== "mouse" && target && !same(target, touchChoice))
      return display(target, true);
    if (target) return open(target);
    display(null);
    selectMark?.(null);
    select(null);
    const place = read().onPlace;
    const point = place && !e.shiftKey ? scene.controls.pick(e.clientX, e.clientY) : null;
    if (point) place?.(point);
  };
  const clear = () => {
    picker.close();
    display(null);
  };
  const cancel = (e: PointerEvent) => {
    tap.cancel(e);
    clear();
  };
  const leave = (e: PointerEvent) => {
    // Touch emits leave after every tap, including the tap that opens the label.
    if (e.pointerType !== "touch" && !picker.open) clear();
  };
  const step = (direction: number) => {
    const state = read();
    const targets: { target: MarkerTarget; lon: number; lat: number }[] = [];
    const bounds = canvas.getBoundingClientRect();
    const visible = (lon: number, lat: number) => {
      const p = scene.controls.project(lon, lat);
      return (
        p !== null &&
        p.x >= bounds.left &&
        p.x < bounds.right &&
        p.y >= bounds.top &&
        p.y < bounds.bottom &&
        document.elementFromPoint(p.x, p.y) === canvas
      );
    };
    const cutoff = revealUntil() ?? Infinity;
    const clock = now();
    feed.store.forEach((quake) => {
      if (quake.primary.time <= cutoff && matches(quake, state.filters, clock))
        targets.push({
          target: { kind: "quake", id: quake.key },
          lon: quake.primary.lon,
          lat: quake.primary.lat,
        });
    });
    const ids = new Set<string>();
    for (const mark of state.marks) {
      if (mark.id && mark.anchor && !ids.has(mark.id)) {
        ids.add(mark.id);
        targets.push({ target: { kind: "mark", id: mark.id }, ...mark.anchor });
      }
    }
    const at = targets.findIndex(({ target }) => same(target, preview));
    const start = at < 0 && direction < 0 ? 0 : at;
    for (let offset = 1; offset <= targets.length; offset++) {
      const candidate = targets[(start + direction * offset + targets.length) % targets.length]!;
      if (visible(candidate.lon, candidate.lat)) return display(candidate.target);
    }
    clear();
  };
  const focus = () => {
    if (landing() && canvas.matches(":focus-visible")) step(1);
  };
  const key = (e: KeyboardEvent) => {
    if (!landing() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape" && preview) clear();
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") step(e.key === "ArrowRight" ? 1 : -1);
    else if (e.key === "Enter" || e.key === " ") {
      if (preview) open(preview);
      else step(1);
    } else {
      if (/^(Arrow(Up|Down)|[+=_\-0])$/.test(e.key)) clear();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };
  const options = { signal: listeners.signal };
  canvas.addEventListener("pointermove", move, options);
  canvas.addEventListener("pointerdown", down, options);
  canvas.addEventListener("pointerup", up, options);
  canvas.addEventListener("pointercancel", cancel, options);
  canvas.addEventListener("pointerleave", leave, options);
  canvas.addEventListener("wheel", clear, { ...options, passive: true });
  canvas.addEventListener("focus", focus, options);
  canvas.addEventListener("blur", () => display(null), options);
  canvas.addEventListener("keydown", key, options);
  return {
    clear,
    dispose() {
      clearTimeout(timer);
      listeners.abort();
      picker.dispose();
    },
  };
}
