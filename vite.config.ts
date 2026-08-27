import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
          if (id.includes("/node_modules/react")) return "react";
          return undefined;
        },
      },
    },
  },
});
