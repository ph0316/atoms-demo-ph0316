import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  server: {
    hmr: false,
  },
  test: {
    api: false,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
