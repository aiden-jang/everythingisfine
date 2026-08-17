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
          if (id.includes("world-atlas") || id.includes("/src/geo/")) return "land";
          if (id.includes("/node_modules/three/")) return "three";
          if (id.includes("/node_modules/react")) return "react";
          return undefined;
        },
      },
    },
  },
});
