import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/live/**/*.test.ts"],
    testTimeout: 30_000, // Live API calls may be slow
    hookTimeout: 30_000,
    sequence: { concurrent: false }, // Run sequentially to avoid rate limiting
  },
});
