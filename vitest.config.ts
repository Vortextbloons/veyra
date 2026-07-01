import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  cacheDir: "node_modules/.vitest",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
