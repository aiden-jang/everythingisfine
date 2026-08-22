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
           */
          if (id.includes("plateMotion.json")) return undefined;
          if (id.includes("world-atlas") || id.includes("/src/geo/")) return "land";
          if (id.includes("/node_modules/three/")) return "three";
          if (id.includes("/node_modules/react")) return "react";
          return undefined;
        },
      },
    },
  },
});
