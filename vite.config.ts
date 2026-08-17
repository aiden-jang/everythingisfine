import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    assetsDir: "a",
    // Coastline geometry is measured separately from application code, per DESIGN.md section 11,
    // so a geometry swap can never hide a code regression behind one combined number.
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes("/src/geo/land") ? "land" : undefined),
      },
    },
  },
});
