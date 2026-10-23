import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages project site base path (only for production build)
  base: command === "serve" ? "" : "/SemiconductorTycoon/",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // Capacitor expects the built web assets in the "www" folder
  build: {
    outDir: "www",
    emptyOutDir: true,
  },
}));