/**
 * Architecture as code. `bun lint` fails when a dependency crosses a boundary.
 * Layers inside every API feature (Clean Architecture, dependencies point inward):
 *
 *   http ──► application ──► domain
 *     │            ▲
 *     └──► (wired only in *-feature.ts) ◄── infrastructure
 */
import { builtinModules } from "node:module";

const FEATURE = "^apps/api/src/features/([^/]+)/";
const TEST_FILE = "[.]test[.]tsx?$";

/** @type {import("dependency-cruiser").IConfiguration} */
const config = {
  forbidden: [
    // ── Clean Architecture ──────────────────────────────────────────────────────
    {
      name: "domain-is-pure",
      comment:
        "Domain = business rules only: no frameworks, no I/O, no other layers, no Node/Bun APIs.",
      severity: "error",
      from: { path: `${FEATURE}domain/`, pathNot: TEST_FILE },
      to: {
        pathNot: [`${FEATURE}domain/`, String.raw`^apps/api/src/shared/result\.ts$`],
      },
    },
    {
      name: "application-depends-on-domain-only",
      comment:
        "Use cases orchestrate the domain through ports (interfaces). No HTTP, no DB, no libraries.",
      severity: "error",
      from: { path: `${FEATURE}application/`, pathNot: TEST_FILE },
      to: {
        pathNot: [
          `${FEATURE}(application|domain)/`,
          String.raw`^apps/api/src/shared/(result|clock)\.ts$`,
          String.raw`^apps/api/src/auth/current-user\.ts$`,
        ],
      },
    },
    {
      name: "infrastructure-does-not-know-http",
      comment: "Adapters implement application ports; they never import the HTTP layer.",
      severity: "error",
      from: { path: `${FEATURE}infrastructure/` },
      to: { path: `${FEATURE}http/` },
    },
    {
      name: "http-does-not-know-infrastructure",
      comment:
        "Routes call use cases; concrete adapters are wired in the feature's composition root (*-feature.ts).",
      severity: "error",
      from: { path: `${FEATURE}http/` },
      to: { path: `${FEATURE}infrastructure/` },
    },
    {
      name: "features-are-isolated",
      comment:
        "A feature must not reach into another feature. Share via apps/api/src/shared or compose in app.ts.",
      severity: "error",
      from: { path: FEATURE },
      to: { path: "^apps/api/src/features/", pathNot: "^apps/api/src/features/$1/" },
    },
    {
      name: "web-imports-api-types-only",
      comment:
        "The browser bundle must never include server code: only `import type { App }` for Eden.",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "^apps/api/", dependencyTypesNot: ["type-only"] },
    },
    {
      name: "web-features-are-isolated",
      severity: "error",
      from: { path: "^apps/web/src/features/([^/]+)/" },
      to: { path: "^apps/web/src/features/", pathNot: "^apps/web/src/features/$1/" },
    },

    // ── General hygiene ─────────────────────────────────────────────────────────
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      comment: "Unreachable module: delete it or import it.",
      severity: "error",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)[.][^/]+[.](?:js|cjs|mjs|ts)$",
          "[.]d[.]ts$",
          "[.]config[.]ts$",
          String.raw`(^|/)(main|app)\.ts$`,
          "^apps/api/src/scripts/",
          "^e2e/",
          String.raw`^apps/web/src/test/setup\.ts$`, // loaded by vitest.config.ts
        ],
      },
      to: {},
    },
    {
      name: "not-to-test",
      comment: "Production code must not depend on tests or test fakes.",
      severity: "error",
      from: { pathNot: "[.](test|fake)[.]tsx?$|^apps/api/tests/|^e2e/" },
      to: { path: "[.](test|fake)[.]tsx?$|^apps/api/tests/" },
    },
    {
      name: "not-to-dev-dep",
      comment: "Production code must not import devDependencies (they are absent in the image).",
      severity: "error",
      from: {
        path: "^apps/[^/]+/src/",
        pathNot: ["[.](test|fake)[.]tsx?$", "^apps/web/src/test/"],
      },
      to: {
        dependencyTypes: ["npm-dev"],
        dependencyTypesNot: ["type-only"],
        pathNot: ["node_modules/@types/"],
      },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-non-package-json",
      comment: "Every imported package must be declared in the importing workspace's package.json.",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
  ],
  options: {
    // Node's built-ins plus Bun's (the types require spelling out the full list).
    builtInModules: { add: [], override: [...builtinModules, "bun", "bun:test"] },
    doNotFollow: { path: ["node_modules"] },
    // Only build output is excluded; node_modules is kept (not followed), otherwise
    // every npm import silently vanishes and the package rules above never fire.
    exclude: { path: [String.raw`^apps/[^/]+/(dist|coverage|reports|\.stryker-tmp)/`] },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    // Resolve packages the way Bun/Vite do (package.json "exports", ESM first).
    // No "types" condition: resolving to .d.ts files hides runtime dependencies.
    enhancedResolveOptions: {
      conditionNames: ["import", "require", "node", "default"],
      exportsFields: ["exports"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs"],
      mainFields: ["module", "main"],
    },
  },
};

export default config;
