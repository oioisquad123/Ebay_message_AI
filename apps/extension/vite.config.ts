import { defineConfig } from "vitest/config";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config.js";

export default defineConfig({
  plugins: [crx({ manifest })],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      // Make sure popup HTML is treated as an input
      input: {
        popup: "src/popup/index.html",
      },
    },
  },
});
