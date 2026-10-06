import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    clearMocks: true,
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      // Component tests target logic. Composition and wiring — pages, layout, route
      // guards, API/auth client setup, shadcn/ui — are covered by Playwright instead
      // (same scope as Stryker's `mutate` in stryker.config.json).
      exclude: [
        "src/**/*.test.tsx",
        "src/test/**",
        "src/main.tsx",
        "src/router.tsx",
        "src/shared/ui/**",
        "src/shared/app-layout.tsx",
        "src/shared/route-error.tsx",
        "src/shared/**/*-client.ts",
        "src/shared/auth/use-current-user.ts",
        "src/**/*-page.tsx",
        "src/**/*-card.tsx",
        "src/features/auth/require-auth.tsx",
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
