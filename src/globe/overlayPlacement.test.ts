import { afterEach, expect, it, vi } from "vitest";
import { overlayPlacement } from "./overlayPlacement";

afterEach(() => vi.unstubAllGlobals());
it("moves a stable hover label without rebuilding its DOM on every animation frame", () => {
  const make = () => ({
    style: {},
    className: "",
    textContent: "",
    append: vi.fn(),
    replaceChildren: vi.fn(),
  });
  const node = make();
  const createElement = vi.fn(make);
  vi.stubGlobal("document", { createElement });
  let x = 100;
  const args = {
    el: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    globe: { controls: { project: () => ({ x, y: 100 }), morph: () => 0 } },
    feed: { store: new Map() },
    clockAt: Date.now,
    read: () => ({
      selected: null,
      inspection: null,
      marks: [{ id: "cyclone:test", anchor: { lon: 0, lat: 0 }, label: "A recorded cyclone" }],
    }),
    hover: () => ({ kind: "mark", id: "cyclone:test" }),
    tooltip: { current: node },
    marker: { current: null },
    hoverRing: { current: null },
    sectionLine: { current: null },
    scaleBar: { current: null },
  } as unknown as Parameters<typeof overlayPlacement>[0];
  const place = overlayPlacement(args);
  for (let frame = 0; frame < 120; frame++) {
    x++;
    place();
  }
  expect(createElement).toHaveBeenCalledTimes(1);
  expect(node.replaceChildren).toHaveBeenCalledTimes(1);
  expect(node.style).toMatchObject({ transform: "translate(220px, 82px) translate(-50%, -100%)" });
});
