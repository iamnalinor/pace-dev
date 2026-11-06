import { defineConfig } from "vitest/config";

// A host-zone assumption must fail everywhere, not only on some machines: the suite runs in a
// zone that is neither UTC nor the owner's (bug-lessons class 135).
process.env["TZ"] = "America/Los_Angeles";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["src/**/*.test.ts", "src/parse/regression/**", "src/core.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      thresholds: { branches: 85, functions: 90, lines: 90, statements: 90 },
    },
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
