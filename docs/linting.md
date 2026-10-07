# Linting: `bun lint`

One command runs every static check and auto-fixes what can be fixed. It is the
pre-commit hook (lefthook, staging its own fixes) and the first CI job; CI then fails if
`bun lint` changed any file (`git status --porcelain` must be empty), so unformatted code,
a stale `tokens.css` or a forgotten migration cannot reach `main`.

| Step | Tool | Catches |
|---|---|---|
| `lint:tokens` | `bun scripts/generate-tokens.ts` | regenerates `apps/web/src/tokens.css` from `packages/core/src/design/tokens.json` (CSS variables per theme for Tailwind v4); drift shows up as a diff |
| `lint:format` | **Biome** (formatter only), `biome format --write .` | formatting of TS/TSX/JS/JSON/CSS |
| `lint:eslint` | **ESLint 10** + plugins, `--fix --max-warnings 0`, one process per workspace (`scripts/eslint-all.ts`, memory), cached in `.cache/eslint/<part>/` | bugs, unsafe types, complexity, conventions |
| `typecheck` | **tsc** (TypeScript 6, strictest) in seven projects: root configs, `packages/core`, `packages/client`, `apps/api`, `apps/web`, `apps/app`, `e2e` | type errors |
| `lint:knip` | **knip** | unused files, exports, types and dependencies; missing dependencies |
| `lint:dup` | **jscpd** (threshold 0, 50+ tokens) | copy-paste outside tests, generated code, the i18n catalogs and `shared/ui` |
| `lint:arch` | **dependency-cruiser** over `apps packages e2e` | layer boundaries, cycles, orphans, dev deps in prod code, undeclared packages |
| `db:check` | `apps/api/scripts/check-migrations.ts` (drizzle-kit) | a D1 or Durable Object schema change without a committed migration |

Scoped runs while working on one package (the same tools, fewer files):
`bunx biome format --write <paths>`, `bunx eslint --fix --max-warnings 0 <paths>`,
`bunx tsc -p <package dir>`. Finish with the full `bun lint`.

The rule of thumb: **as strict as possible, unless a rule makes the code worse**. Every
rule that is off or relaxed has a comment next to it in `eslint.config.ts`.

## TypeScript

`tsconfig.base.json` extends [`@tsconfig/strictest`](https://github.com/tsconfig/bases)
and adds `verbatimModuleSyntax`, `erasableSyntaxOnly` (no `enum`, `namespace` or
parameter properties: Bun, Vite and Metro strip types without transforming code),
`noUncheckedSideEffectImports`, `checkJs` and `types: []` (every project lists what it
needs). `skipLibCheck` is the only concession. `apps/app/tsconfig.json` extends
`expo/tsconfig.base` instead and re-enables the same strict flags by hand. Both apps
declare their alias (`#web/*`, `#app/*`) through package.json `imports`, which
TypeScript, Vite, Metro, Jest, eslint, knip and dependency-cruiser all resolve natively.

TypeScript is pinned to **6.0.x** in the catalog: typescript-eslint does not support
TS 7 yet.

## ESLint

`eslint.config.ts` is one flat config for the monorepo.

- **typescript-eslint** `strictTypeChecked` + `stylisticTypeChecked`, plus
  `switch-exhaustiveness-check` (no `default` for unions), `strict-boolean-expressions`
  (no truthiness on strings, numbers or nullable objects), `consistent-type-imports`
  (inline `import type`), `explicit-module-boundary-types`, `return-await: always`,
  `naming-convention` (PascalCase types, components and zod schemas; UPPER_CASE
  constants).
- **Size limits**: `complexity` 10, `max-depth` 3, `max-params` 3, `max-statements` 15,
  `max-lines-per-function` 60 (80 in React files), `max-lines` 300, `max-nested-callbacks` 3.
- **Banned syntax**: `enum` (use a union of literals), `for..in`, `console` outside
  loggers and scripts, `==`, implicit coercion, parameter reassignment.
- **unicorn** (recommended), **sonarjs** (cognitive complexity 10), **import-x**
  (cycles, duplicates, `no-default-export`, extraneous deps, relative package imports),
  **perfectionist** (sorted imports, exports, named imports/exports, union and
  intersection types, JSX props, heritage clauses; `#web`, `#app` and `@pace` are
  internal groups), **check-file** (kebab-case files and folders, no `index.ts`),
  **promise** (`await` over `.then`), **regexp**, **security**, **eslint-comments**
  (every `eslint-disable` needs `-- reason`; unused directives are errors).
- **functional** in the pure layers (`packages/core/src/**`,
  `packages/client/src/view-models/**`, tests excluded): no `let`, no mutation, no
  classes, no `this`, no `throw`, `readonly` everywhere.
- React (web + app): **@eslint-react** strict type-checked, **react-hooks** (incl. the
  React Compiler rules), **better-tailwindcss** (Tailwind v4 via `apps/web/src/styles.css`
  on the web, Tailwind v3 via `apps/app/tailwind.config.js` for NativeWind).
- Web only: **jsx-a11y** strict; the `Bun` global is banned (browser code).
- Tests: **@vitest/eslint-plugin**, **testing-library** (web), **playwright** (e2e).
- `eslint-config-prettier` turns off stylistic rules the formatter owns; `curly: all`
  and `no-unexpected-multiline` do not conflict with Biome and are re-enabled after it.

### Deliberately off or relaxed (and why)

| Where | Rule | Why |
|---|---|---|
| everywhere | `unicorn/no-null` | `null` is part of JSON, SQL and React APIs |
| everywhere | `unicorn/name-replacements` | fights conventional names (`db`, `props`, `params`, `env`, `err`) |
| everywhere | `unicorn/filename-case` | check-file owns file naming |
| everywhere | `unicorn/single-line-block-comment-style` | one-line JSDoc is idiomatic |
| everywhere | `unicorn/no-useless-undefined` (arrow bodies) | `() => undefined` is the explicit "ignore" callback |
| everywhere | `sonarjs/deprecation`, `sonarjs/no-unused-vars` | duplicated by the type-aware typescript-eslint rules |
| everywhere | `sonarjs/todo-tag` | TODOs are allowed with a tracking reference (review) |
| everywhere | `security/detect-object-injection` | flags every `obj[key]`; noise in type-checked code |
| everywhere | `import-x/no-unresolved` | resolution is tsc's job, which runs right after |
| everywhere | `promise/always-return` | async/await style; `.then` chains are banned anyway |
| everywhere | `@typescript-eslint/no-misused-promises` for JSX attributes | `onClick={async () => …}` is idiomatic React |
| everywhere | perfectionist `sort-objects` / `sort-object-types` / `sort-interfaces` / `sort-classes` not enabled | they destroy meaningful order (id first, table columns, config sections) |
| React files | `promise-function-async` | React 19's `ReactNode` includes `Promise`; the autofix would turn components into async components |
| React files, routes, tests, inferred contracts (`app.ts`, `worker.ts`, `*-routes.ts`, `mcp/`) | `explicit-module-boundary-types` | the inferred type is the contract, or the component return type is noise |
| `apps/app/app/**` | check-file rules, `no-default-export` | expo-router maps the file system to routes (`(tabs)`, `[id].tsx`, `_layout.tsx`) and needs default exports |
| `apps/app/modules/*/index.ts` | `check-file/no-index` | Expo local modules autolink by `index.ts` |
| `apps/app/*.js`, `apps/app/plugins/*.js` | type-checked rules, `no-require-imports`, `prefer-module` | Expo loads Metro/Babel configs and config plugins as CommonJS under Node |
| `apps/api/src/worker.ts`, config files, `*.d.ts` | `no-default-export` | the Workers runtime, every tool and module declarations require it |
| config files | `no-unsafe-assignment`, `no-unsafe-member-access`, `max-lines` | declarative lists; some plugins ship without types |
| loggers, `scripts/**`, `apps/api/scripts/**` | `no-console`, `no-process-exit`, `detect-non-literal-fs-filename` | they own stdout and the exit code and work with paths they compute |
| tests | size limits, `no-duplicate-string`, `no-await-expression-member`, `require-await`, `no-nested-functions`; `max-nested-callbacks` 5 | tests are long and repetitive by design (DAMP over DRY); fakes implement async ports synchronously |
| `apps/web/src/shared/ui/**` | `no-unstable-default-props`, `sort-jsx-props`, tailwind class rules | hand-written shadcn-style components kept close to upstream; type-safety rules stay on |
| `*.d.ts` | `consistent-type-definitions`, `consistent-type-imports` | ambient augmentation needs `interface` and `import()` types |

## Biome (formatter only)

Biome's linter and assists are disabled — ESLint is the single linter. The config
therefore uses `eslint-config-prettier`, not `eslint-config-biome` (which would turn off
ESLint rules the Biome *linter* covers and silently lose checks). Settings: 2 spaces,
100 columns, double quotes, semicolons, trailing commas. It skips `drizzle/meta`, the
bundled DO migrations, `worker-configuration.d.ts` and the generated `android/` folder.
Markdown and YAML are not formatted (editorconfig covers whitespace there).

## knip

`knip.jsonc` declares the entry points knip cannot infer (tests, scripts, drizzle configs,
the schema files the drizzle configs reference, `plugins/*.js`) and a few
`ignoreDependencies` with the reason next to each: runtime modules that are not npm
packages (`cloudflare:*`), fonts referenced by path from `app.config.ts`, Stryker's
built-in runner, and dependencies pre-declared for the next milestone with a
"drop when used" comment. Metro config loading is off because NativeWind's Metro plugin
writes files when loaded.

## dependency-cruiser

The boundaries are listed in [architecture.md](architecture.md#layers). Beyond them:
no circular dependencies, no orphan modules (with exemptions for entry points tools
discover by file name: `worker.ts`, expo-router routes, config plugins, test setup
files, scripts), production code never imports tests, fakes or devDependencies, every
import must resolve and be declared in the importing workspace's `package.json`.

## Dependency hygiene

- Exact versions (`bunfig.toml`: `exact = true`); packages that must move together are
  pinned once in the root `catalog` (TypeScript, Vite/Vitest, zod, hono, drizzle-orm,
  wrangler, zustand, date-fns, ulidx, fast-check).
- `bun audit --audit-level=high` runs in CI.
- Dependabot opens weekly grouped updates: Expo SDK packages, Cloudflare, lint tools and
  test tools each move together; GitHub Actions are updated too. The generated Gradle
  project is not tracked.
