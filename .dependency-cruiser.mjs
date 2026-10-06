/**
 * Architecture as code. `bun lint` fails when a dependency crosses a boundary.
 *
 *   apps/app ─┐
 *   apps/web ─┼─► packages/client ─► packages/core (incl. the zod API contract)
 *   apps/api ─┴───────────────────► packages/core
 *
 * core is pure (no platform, no other workspace); client never imports an app or the API;
 * apps never import each other; API features only reach other features through shared/.
 */
import { builtinModules } from "node:module";

const API_FEATURE = "^apps/api/src/([^/]+)/";

/** @type {import("dependency-cruiser").IConfiguration} */
const config = {
  forbidden: [
    // ── Workspace boundaries ────────────────────────────────────────────────────
    {
      name: "core-is-pure",
      comment: "core = shared business rules: no workspace imports, no platform code.",
      severity: "error",
      from: { path: "^packages/core/src/" },
      to: { path: "^(apps|packages/client|e2e)/" },
    },
    {
      name: "client-does-not-know-apps",
      comment: "The API contract lives in core (zod endpoints); client never sees Worker code.",
      severity: "error",
      from: { path: "^packages/client/src/" },
      to: { path: "^apps/" },
    },
    {
      name: "api-does-not-import-ui",
      severity: "error",
      from: { path: "^apps/api/" },
      to: { path: "^(apps/(web|app)|packages/client)/" },
    },
    {
      name: "ui-does-not-import-api",
      comment: "The browser/phone bundle must never include server code; the contract is in core.",
      severity: "error",
      from: { path: "^apps/(web|app)/" },
      to: { path: "^apps/api/" },
    },
    {
      name: "apps-are-isolated",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "^apps/app/" },
    },
    {
      name: "app-does-not-import-web",
      severity: "error",
      from: { path: "^apps/app/" },
      to: { path: "^apps/web/" },
    },
    {
      name: "api-features-are-isolated",
      comment:
        "An API feature folder must not reach into another one. Share via apps/api/src/shared or compose in app.ts/worker.ts.",
      severity: "error",
      from: { path: API_FEATURE, pathNot: "^apps/api/src/shared/" },
      to: {
        path: "^apps/api/src/",
        pathNot: [
          "^apps/api/src/$1/",
          "^apps/api/src/shared/",
          String.raw`^apps/api/src/[^/]+\.ts$`,
        ],
      },
    },
    {
      name: "web-features-are-isolated",
      severity: "error",
      from: { path: "^apps/web/src/features/([^/]+)/" },
      to: { path: "^apps/web/src/features/", pathNot: "^apps/web/src/features/$1/" },
    },
    {
      name: "app-features-are-isolated",
      severity: "error",
      from: { path: "^apps/app/src/features/([^/]+)/" },
      to: { path: "^apps/app/src/features/", pathNot: "^apps/app/src/features/$1/" },
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
          "[.]config[.](ts|js)$",
          String.raw`^apps/api/src/worker\.ts$`,
          "^apps/api/scripts/",
          "^apps/app/app/", // expo-router discovers routes by file name
          "^apps/app/plugins/",
          "^apps/app/modules/[^/]+/index[.]ts$",
          String.raw`^apps/app/jest\.setup\.ts$`,
          "^e2e/",
          "^scripts/",
          String.raw`^apps/web/src/test/setup\.ts$`, // loaded by vitest.config.ts
          String.raw`^apps/api/tests/setup\.ts$`, // loaded by vitest.config.ts
          "^packages/core/src/parse/regression/",
        ],
      },
      to: {},
    },
    {
      name: "not-to-test",
      comment: "Production code must not depend on tests or test fakes.",
      severity: "error",
      from: { pathNot: "[.](test|fake)[.]tsx?$|^apps/api/tests/|^e2e/|/test/" },
      to: { path: "[.](test|fake)[.]tsx?$|^apps/api/tests/|/test/" },
    },
    {
      name: "not-to-dev-dep",
      comment: "Production code must not import devDependencies.",
      severity: "error",
      from: {
        path: "^(apps/[^/]+/(src|app|modules)|packages/[^/]+/src)/",
        pathNot: ["[.](test|fake)[.]tsx?$", "/test/"],
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
    builtInModules: {
      add: [],
      override: [...builtinModules, "bun", "bun:test", "cloudflare:workers", "cloudflare:test"],
    },
    doNotFollow: { path: ["node_modules"] },
    exclude: {
      path: [
        String.raw`^apps/[^/]+/(dist|coverage|reports|\.stryker-tmp|android|\.expo|\.wrangler)/`,
        String.raw`^packages/[^/]+/(coverage|reports|\.stryker-tmp)/`,
        "^apps/api/drizzle/",
        String.raw`worker-configuration\.d\.ts$`,
        String.raw`nativewind-env\.d\.ts$`, // triple-slash reference to a types-only package entry
      ],
    },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      conditionNames: ["import", "require", "node", "react-native", "default"],
      exportsFields: ["exports"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
      mainFields: ["module", "main"],
    },
  },
};

export default config;
