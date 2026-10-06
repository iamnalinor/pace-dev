# Linting: `bun lint`

One command runs every static check, auto-fixing what can be fixed. It is also the
pre-commit hook (lefthook) and the first CI job; CI additionally fails if `bun lint`
changed or created any file (`git status --porcelain` must be empty), so unformatted
code or a forgotten migration cannot reach `main`.

| Step | Tool | Catches |
|---|---|---|
| `lint:format` | **Biome** (formatter only) | formatting; Prettier-compatible, ~100× faster |
| `lint:eslint` | **ESLint 10** + plugins, `--fix --max-warnings 0` | bugs, unsafe types, complexity, conventions |
| `typecheck` | **tsc** (TypeScript 6, strictest) | type errors in every project (root, api, web, e2e) |
| `lint:knip` | **knip** | unused files, exports, types, dependencies; missing dependencies |
| `lint:dup` | **jscpd** (threshold 0) | copy-paste (50+ tokens) outside tests and generated code |
| `lint:arch` | **dependency-cruiser** | architecture boundaries, cycles, orphans, dev deps in prod code |
| `db:check` | **drizzle-kit** (`src/scripts/check-migrations.ts`) | schema changes without a migration; inconsistent migration history |

The rule of thumb: **as strict as possible, unless a rule makes the code worse**. Every
rule that is off or relaxed has a comment next to it in the config.

## TypeScript

`tsconfig.base.json` extends [`@tsconfig/strictest`](https://github.com/tsconfig/bases)
(`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`, unused locals/parameters…) and adds
`verbatimModuleSyntax`, `erasableSyntaxOnly` (no `enum`/`namespace`/parameter
properties: plain TS that Bun and Vite strip without transformation),
`noUncheckedSideEffectImports` and `checkJs`. `skipLibCheck` is the only concession.

TypeScript is pinned to **6.0.x**: typescript-eslint does not support TS 7 (the
native Go compiler) yet, and its peer range stops before 6.1.

## ESLint

`eslint.config.ts` is a single flat config for the monorepo.

- **typescript-eslint** `strictTypeChecked` + `stylisticTypeChecked`, plus:
  `no-floating-promises`, `no-misused-promises`, `switch-exhaustiveness-check`
  (no `default` for unions: every new case must be handled), `strict-boolean-expressions`
  (no truthiness on strings/numbers/nullable objects), `no-unnecessary-condition`,
  `prefer-nullish-coalescing`, `no-explicit-any` and the whole `no-unsafe-*` family,
  `consistent-type-imports`, `explicit-module-boundary-types`, `naming-convention`.
- **Size limits** (in the spirit of WPS): `complexity` 10, `max-depth` 3, `max-params` 3,
  `max-statements` 15, `max-lines-per-function` 60 (80 in JSX), `max-lines` 300.
- **eslint-plugin-unicorn** (recommended) — modern JS idioms.
- **eslint-plugin-sonarjs** — cognitive complexity (10), identical branches/functions, code smells.
- **eslint-plugin-functional** — in `domain/` and `application/` only: no `let`, no
  mutation, no classes, no `throw`, readonly types.
- **eslint-plugin-import-x** — cycles, duplicates, `no-default-export` (except tool
  configs), extraneous dependencies.
- **eslint-plugin-perfectionist** — sorted imports, exports, union types, JSX props.
- **eslint-plugin-check-file** — kebab-case file and folder names, no `index.ts` barrels.
- **eslint-plugin-promise**, **eslint-plugin-regexp** (unsafe/inefficient regexes),
  **eslint-plugin-security**, **@eslint-community/eslint-comments** (every
  `eslint-disable` needs a `-- reason`, unused disables are errors).
- Web: **@eslint-react** (strict, type-checked), **react-hooks** (incl. React Compiler
  rules), **jsx-a11y** (strict), **better-tailwindcss** (class order, conflicts, unknown classes).
- Tests: **@vitest/eslint-plugin**, **testing-library**, **playwright**.
- `eslint-config-prettier`: turns off purely stylistic rules the formatter owns. It also
  turns off a few "special" rules; `curly: all` and `no-unexpected-multiline` do not
  conflict with Biome and are re-enabled after it.

### Deliberately off or relaxed (and why)

| Rule | Why |
|---|---|
| `unicorn/no-null` | `null` is part of JSON, SQL and React APIs |
| `unicorn/name-replacements` (prevent-abbreviations) | fights conventional names (`db`, `props`, `params`, `env`) |
| `unicorn/filename-case` | check-file owns file naming |
| `unicorn/single-line-block-comment-style` | one-line JSDoc is idiomatic |
| `security/detect-object-injection` | flags every `obj[key]`; pure noise in type-checked code |
| perfectionist `sort-objects` / `sort-interfaces` / `sort-classes` | destroys meaningful order (id first, table columns, config sections) |
| `promise-function-async` in `.tsx` | React 19's `ReactNode` includes `Promise`; the autofix would turn components into async components |
| `explicit-module-boundary-types` in JSX, Elysia/Drizzle factories and tests | the inferred type *is* the contract (Eden derives the client from it) |
| `import-x/no-unresolved` | resolution is tsc's job, which runs right after |
| size limits in tests | tests are long and repetitive by design (DAMP over DRY) |
| shadcn/ui (`shared/ui/`) | vendored code kept close to upstream: only stylistic/size rules are relaxed, type-safety rules stay on |

## Biome (formatter only)

Biome's linter is disabled — ESLint is the single linter. Because of that the config
uses `eslint-config-prettier`, **not** `eslint-config-biome`: the latter disables ESLint
rules that the *Biome linter* covers, which would silently lose checks here.
Biome does not format Markdown/YAML (editorconfig covers whitespace there).

## dependency-cruiser

The architecture rules are described in [architecture.md](architecture.md#api-clean-architecture-per-feature).
Also: no circular dependencies, no orphan modules, production code must not import
tests or devDependencies, every import must resolve and be declared in `package.json`.

## Dependency hygiene

- Exact versions (`bunfig.toml`: `exact = true`); interdependent packages (Elysia/Eden,
  TypeScript, Vite/Vitest, better-auth) are pinned once in the root `catalog`.
- `bun audit --audit-level=high` runs in CI. `overrides` in the root `package.json`
  patch vulnerable transitive dev dependencies (`deepmerge-ts` via
  eslint-plugin-functional, `qs` via Stryker); remove them once upstream updates.
- Dependabot opens weekly grouped updates (Elysia packages always move together).
