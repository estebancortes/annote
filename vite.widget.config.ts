import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/widget.ts",
      name: "Annote",
      formats: ["iife"],
      fileName: () => "annote.js",
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
