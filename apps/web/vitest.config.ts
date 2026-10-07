import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    clearMocks: true,
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      // Component tests target logic. Composition and wiring — pages, layout, route
      // guards, platform adapters, shadcn/ui — are covered by Playwright instead.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/main.tsx",
        "src/router.tsx",
        "src/shared/ui/**",
        "src/platform/**",
        "src/**/*-page.tsx",
        "src/**/*-layout.tsx",
        "src/shared/route-error.tsx",
      ],
      provider: "v8",
      thresholds: { branches: 75, functions: 85, lines: 90, statements: 90 },
      reporter: ["text-summary", "lcov"],
    },
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
