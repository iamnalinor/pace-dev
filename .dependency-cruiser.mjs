/**
Architecture as code. `bun lint` fails when a dependency crosses a boundary.

  apps/app ─► packages/client ─► packages/core (incl. the zod API contract)
  apps/api ─────────────────────► packages/core

core is pure (no platform, no other workspace); client never imports an app or the API;
the app (phone and web) never imports the API; API features only reach other features
through shared/.
*/
import { builtinModules } from "node:module";

const API_FEATURE = "^apps/api/src/([^/]+)/";

/** @type {import("dependency-cruiser").IConfiguration} */
const config = {
  forbidden: [
    {
      name: "updates-independent-of-account-apps",
      comment: "The publisher cannot depend on the account server or UI.",
      severity: "error",
      from: { path: "^apps/updates/" },
      to: { path: "^apps/(api|app)/" },
    },
    {
      name: "account-apps-independent-of-updates",
      comment: "Account-server selection cannot control executable update delivery.",
      severity: "error",
      from: { path: "^apps/(api|app)/" },
      to: { path: "^apps/updates/" },
    },
    {
      name: "updates-server-has-no-signing-or-export-io",
      comment:
        "The publisher serves signed artifacts; private-key and filesystem operations stay in CI.",
      severity: "error",
      from: { path: "^apps/updates/src/" },
      to: {
        path: "^scripts/ota/(signing|read-export|asset-key)[.]ts$",
        dependencyTypesNot: ["type-only"],
      },
    },
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
      to: { path: "^(apps/app|packages/client)/" },
    },
    {
      name: "ui-does-not-import-api",
      comment: "The browser/phone bundle must never include server code; the contract is in core.",
      severity: "error",
      from: { path: "^apps/app/" },
      to: { path: "^apps/api/" },
    },
    {
      name: "api-features-are-isolated",
      comment:
        "An API feature folder must not reach into another one. Share via apps/api/src/shared or compose in app.ts/worker.ts.",
      severity: "error",
      // platform/ is the composition layer (Cloudflare adapters wired by worker.ts), not a
      // feature: it may import features, and no feature may import it (the `to` below has no
      // carve-out for platform/, which also covers feature tests).
      from: { path: API_FEATURE, pathNot: "^apps/api/src/(shared|platform)/" },
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
      name: "portable-api-does-not-import-platform",
      comment:
        "Converted API consumers and ports depend on abstractions; the host composes adapters.",
      severity: "error",
      from: {
        path: "^apps/api/src/",
        pathNot: [
          "^apps/api/src/platform/",
          "^apps/api/src/worker[.]ts$",
          "[.]test[.]ts$",
          "[.]d[.]ts$",
        ],
      },
      to: { path: "^apps/api/src/platform/" },
    },
    {
      name: "app-features-are-isolated",
      severity: "error",
      from: { path: "^apps/app/src/features/([^/]+)/" },
      to: { path: "^apps/app/src/features/", pathNot: "^apps/app/src/features/$1/" },
    },
    {
      name: "app-kit-does-not-import-features",
      comment:
        "The kit (src/ui) knows nothing of features or screens: a composer passes them in (bug-lessons 272).",
      severity: "error",
      from: { path: "^apps/app/src/ui/", pathNot: "\\.test\\.tsx?$" },
      to: { path: "^apps/app/src/(features|screens)/" },
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
          "^apps/app/public/", // loaded by index.html, not imported
          "^apps/app/modules/[^/]+/index[.]ts$",
          String.raw`^apps/app/jest\.setup\.ts$`,
          String.raw`^apps/app/jest\.global-setup\.js$`, // loaded by jest's globalSetup
          String.raw`^apps/app/src/tz-guard\.test\.ts$`, // a guard on the runner, imports nothing
          "^e2e/",
          "^scripts/",
          // The web build swaps these in for their siblings (metro.config.js), by file name.
          "^apps/app/src/.+[.]web[.]tsx?$",
          "^apps/app/src/platform/web/",
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
      from: {
        pathNot: [
          "[.](test|fake)[.]tsx?$|^apps/api/tests/|^e2e/|/test/",
          // Jest's setup file is test code: it installs the fakes before every suite.
          String.raw`^apps/app/jest\.setup\.ts$`,
          // The test-support entry (`@pace/core/testing`) re-exports the fixtures on purpose.
          String.raw`^packages/core/src/testing\.ts$`,
        ],
      },
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
      // `builtinModules` omits the modules that only exist under the `node:` scheme.
      override: [
        ...builtinModules,
        "node:sqlite",
        "bun",
        "bun:test",
        "cloudflare:workers",
        "cloudflare:test",
      ],
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
