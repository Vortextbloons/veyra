import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "zustand",
      "lucide-react",
      "@tauri-apps/api/core",
      "@tauri-apps/plugin-http",
    ],
  },
  server: {
    port: 1420,
    strictPort: true,
    warmup: {
      clientFiles: ["./src/main.tsx", "./src/App.tsx"],
    },
  },
  envPrefix: ["VITE_"],
  build: {
    target: process.env.TAURI_PLATFORM === "macos" ? "safari14" : "chrome105",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@tauri-apps/")) {
            return "vendor-tauri";
          }
          if (
            id.includes("node_modules/lucide-react") ||
            id.includes("node_modules/clsx") ||
            id.includes("node_modules/tailwind-merge") ||
            id.includes("node_modules/class-variance-authority")
          ) {
            return "vendor-ui";
          }
        },
      },
    },
  },
});
