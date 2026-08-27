import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  /*
   * Preact behind React's API, which DESIGN.md section 11 names as the lever for the application-code
   * budget and which has now been pulled.
   *
   * The preset rather than hand-written aliases: it maps `react`, `react-dom` and both JSX runtimes to
   * `preact/compat`, and it swaps react-refresh for prefresh. Hand-aliasing would have left
   * `@vitejs/plugin-react` injecting a refresh runtime that preact does not implement, which breaks the
   * dev server the browser suite runs against - and the unit suite would not have noticed, because not
   * one of its tests renders a component.
   *
   * The source keeps importing from "react" throughout. Nothing here uses an API preact/compat does not
   * cover: StrictMode, lazy, Suspense, five hooks, createRoot and three types.
   */
  plugins: [preact(), tailwindcss()],
  /*
   * The aliases spelled out, because the preset's own only reach the client build.
   *
   * Removing `react` from the dependencies broke three unit files the moment they imported a module that
   * imports it: vitest resolves through Node and never saw the preset's mapping. Declared here so the
   * swap holds in the dev server, the production build and the test runner alike.
   *
   * Two entries cover four specifiers. Vite matches a string alias on the whole name or on a `name/`
   * prefix and rewrites just that part, so `react/jsx-runtime` becomes `preact/compat/jsx-runtime` and
   * `react-dom/client` becomes `preact/compat/client` without either being listed.
   */
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
  build: {
    assetsDir: "a",
    /*
     * Four budgets, not one. Per DESIGN.md section 11.
     *
     * One combined number is unreadable: three.js alone is 130kB gzipped and fixed, so an app-code
     * regression of 20kB looks like an 11% drift against a total and like a third of the budget
     * against the thing that actually changed. Vendors are paid for once and measured once;
     * application code and geometry are what move, so they get their own lines.
     */
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          /*
           * Assigning a module to a manual chunk overrides dynamic-import splitting.
           *
           * This rule swept every file under `/src/geo/` into `land`, which is right for measurement -
           * geometry gets its own budget line - and quietly wrong for loading: `plateMotion.json` is
           * imported only by `await import()`, behind the arrows toggle, and both its comment and the
           * budget said "its own chunk". It was in `land`, and `land` is modulepreloaded because the
           * eager graph reaches it, so 7kB nobody had asked for was fetched on every visit.
           *
           * Excluded by name rather than by extension, because `plates.json` genuinely belongs in `land`:
           * `scene.ts` draws the boundaries on the first frame, so there is no laziness to be had there.
           *
           * `slab.json` arrived and made the same mistake, which is the argument for the list rather than
           * against it: 37kB of deep seismicity behind an off-by-default toggle went straight into `land`
           * and onto every first visit, while its own comment claimed it was a chunk nobody paid for
           * until they asked. Anything under `/src/geo/` reached only by `await import()` belongs here.
           *
           * `stars.json` is the third, and the biggest: 88kB took `land` from 41kB over the wire to 76kB,
           * an 84% rise on a preloaded chunk. It is not behind a toggle - the sky is always drawn - so it
           * is here for the other reason, which is that it is the layer furthest behind the entrance and
           * the only one whose arriving a moment late cannot be seen.
           */
          if (
            id.includes("plateMotion.json") || id.includes("slab.json")
            || id.includes("stars.json") || id.includes("figures.json")
          ) return undefined;
          /*
           * The sky's own arithmetic, out of the geometry line.
           *
           * `land` is budgeted and named as coastline and plate geometry, and the rule below sweeps
           * everything under `/src/geo/` into it - so a star catalogue's loader, a lunar series, five
           * planets and two eclipse geometries all landed in a line measuring coastlines. It went 3.5KB
           * over budget and the number had stopped describing its own row, which is worse than the
           * overage.
           *
           * **This saves nothing at load and is not meant to.** The sky draws on the first frame, so this
           * chunk is preloaded exactly as `land` is. What it buys is that each budget line now measures
           * the thing its name says, which is the only reason the budget catches anything.
           *
           * `sun.ts` deliberately stays in `land`: it predates the sky and its job here is lighting the
           * planet's own night side, so it belongs with the geometry it shades.
           */
          if (/\/src\/geo\/(stars|moon|planets|eclipse)\.ts$/.test(id)) return "sky";
          if (id.includes("world-atlas") || id.includes("/src/geo/")) return "land";
          if (id.includes("/node_modules/three/")) return "three";
          /*
           * Still called "react" so the budget line and its history stay comparable: this is the same
           * row measuring the same job, now done by preact/compat behind React's API.
           */
          if (id.includes("/node_modules/preact") || id.includes("/node_modules/react")) return "react";
          return undefined;
        },
      },
    },
  },
});
