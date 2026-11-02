# Agent instructions

Pace — a personal task & time tracker. Bun workspaces: `packages/core` (pure shared logic),
`packages/client` (local-first store + sync + view-models), `apps/api` (Cloudflare Worker:
Hono + Durable Objects + D1), `apps/app` (Expo: the one UI, Android and the web through
react-native-web, PWA), `e2e/` (Playwright). Read [docs/architecture.md](docs/architecture.md) before
changing structure. Product background (the spec, decisions taken with the user, the
build history) is in [context/](context/README.md).

## Rules

- **Bun only**: `bun install`, `bun run <script>`, `bunx <tool>`. Never npm/npx/yarn.
  (`vitest`, `jest`, `expo` and `wrangler` run under Node through their shebang — that is
  expected; never force `--bun` on them.)
- **After every change run `bun lint`** and fix everything it reports. Do not run
  biome/eslint/tsc/knip separately — `bun lint` is the single entry point (it auto-fixes).
- **Tests first (TDD)** for behaviour changes. Pick the level per [docs/testing.md](docs/testing.md):
  `bun test:unit` (core, client), `bun test:api` (Worker in workerd with
  real D1/DO/KV), `bun test:app` (jest-expo), `bun test:e2e` (Playwright + axe).
- **Never** disable a lint rule inline without `-- <reason>`; never weaken a rule to pass
  lint — fix the code. Never skip or delete a failing test.
- **Architecture** (enforced by dependency-cruiser): `core` is pure and immutable and
  imports no workspace; `client` imports `core` and only the *types* of `api`; apps import
  `client`/`core` and never each other; API feature folders only share through
  `apps/api/src/shared`.
- **Event sourcing**: every user action is an immutable event (`occurredAt` editable,
  `recordedAt` system); corrections are `event.amended` / `event.revoked`. State is
  derived by `core`'s materializer — never mutate projections directly.
- **Errors**: pure code returns `Result<T, E>` with string-literal error codes; HTTP maps
  them with an exhaustive `switch` (no `default`).
- **API contract first**: every route is a zod `endpoint()` in `packages/core/src/api/endpoints.ts`
  (shared by the Worker and `@pace/client`); the Worker mounts it with `mount(app, endpoint,
  handler)` from `apps/api/src/shared/mount.ts`, which validates input and maps `Result`
  errors. Read bindings from `c.env`, never at module scope.
- **Database**: change `src/shared/db/d1-schema.ts` (D1) or `src/user-store/schema.ts`
  (Durable Object), then `bun db:generate`; review and commit the SQL. Never edit an
  applied migration or `apps/api/drizzle/**/meta/*` by hand.
- **Every UI string goes through `t()`** from `@pace/core` (EN is the source catalog, RU
  mirrors it). User-entered content is never translated or rewritten.
- **App imports** use `#app/*`; packages and API use relative imports.
- **One UI for Android and the web**: screens are React Native in `apps/app`. Web-only code
  goes into a `.web.tsx` sibling (the web build swaps it in, see `metro.config.js`) or the
  stand-ins in `src/platform/web/`; never `if (Platform.OS === "web")` for whole screens.
  Never import a `.web.tsx` file from its own base file (it would resolve to itself).
- **Every new screen, flow, component or visual change follows [docs/design.md](docs/design.md)**:
  read PRODUCT.md, DESIGN.md and the spec first, comp it, build only from tokens and the kit,
  put every new colour pair in `pairs.ts`, try it in the worst-case gallery, shoot the matrix
  (phone/desktop × light/dark × EN/RU) and review the shots with the design skills before the PR.
- Code, comments and identifiers in English.
- **Merge pull requests with squash only** (Dependabot's included), never a merge commit or a
  rebase merge.
- **Every bug teaches a class**: when a bug is found (by the owner, QA, review or a failing run), write
  down in [context/bug-lessons.md](context/bug-lessons.md) why the existing tests missed it and which
  class of mistake it is; sweep the code for every other instance of that class and fix them in the
  same change; add the guard that catches the class from now on (property test, shared helper, e2e
  sweep, QA checklist line or lint rule). Write new code against the classes already listed there.
- **Exploratory QA: a full release round before every release, an intermediate round (scoped to
  the changes) after UI changes and fix waves**: launch a Sonnet agent that
  clicks through the web build in a browser and writes `context/qa-round-<n>.md`
  (both kinds, the procedure and the prompt: [docs/qa.md](docs/qa.md)); in parallel, a code-review agent over
  `git diff origin/main...HEAD`. Fix the findings (TDD), then run the next round until only
  cosmetic findings are left. Tests do not replace this pass.

## Plugins and working method

Skills and agents are named with their source repository, so anyone can install the same ones
(as a plugin, or as single skills through `/plugin` or `npx skills add <repo>`). Use them when the
session has them; without them, follow the same methods by hand. **Superpowers comes first for
method**: before doing a step by hand, check whether one of its skills covers it, and use it.
- **Superpowers** (obra/superpowers): `brainstorming` and `writing-plans` before larger work,
  `test-driven-development`, `systematic-debugging` for every bug (root cause before a fix),
  `verification-before-completion` (run the checks, show the output, then claim done),
  `requesting-code-review` / `receiving-code-review`, `dispatching-parallel-agents`,
  `subagent-driven-development`.
- **Every significant change is reviewed** before it is pushed for merge: a new feature, a bug
  fix, a refactor, a dependency or config change, a migration. The review runs through
  `superpowers:requesting-code-review`, using its reviewer template with the plan or
  requirements and the git range, not a hand-written prompt. Work through the findings with
  `receiving-code-review`. A review by a generic agent does not count.
- **A change to one side of a contract gets the other side traced**: when a fix or feature changes a
  rule on the server (what may be read, answered, revoked, returned, which error code), the review
  brief carries an explicit item "trace the client side" (and the reverse for a client rule), and a
  test pins the steady state across both: after the action the network goes quiet (no request
  repeated for the same id) and the screen settles. A diff-only review cannot see the other side
  (bug-lessons class 1, the read loop of QA round 15).
- **Domain review goes to the specialist agent for the file type** (affaan-m/everything-claude-code):
  `typescript-reviewer` (TypeScript), `react-reviewer` (`.tsx`, hooks), `security-reviewer` (auth,
  input, secrets, endpoints), `database-reviewer` (D1/DO schema, queries, migrations),
  `pr-test-analyzer` (tests), `type-design-analyzer` (types and invariants), `silent-failure-hunter`
  (swallowed errors, quiet fallbacks). The same repository's reference skills back the work in their
  area: `api-design`, `error-handling`, `e2e-testing`, `react-patterns`, `react-testing`,
  `database-migrations`, `mcp-server-patterns`, `security-review`. Use a general-purpose agent only
  when no specialist fits, and give every agent a full brief: the goal, the files, the rules, what
  is already ruled out. A Stop hook that reports failing checks on changed files is fixed at the
  cause, never silenced.
- **Product work before a stage** (product-on-purpose/pm-skills, unless noted): a feedback round is
  synthesized with `discover-interview-synthesis`; each candidate change passes
  `foundation-build-risk-review` before it is specced; a change that survives gets
  `define-problem-statement` → `deliver-prd` → `deliver-edge-cases` → `deliver-acceptance-criteria`
  (the edge-case catalog is written against `context/bug-lessons.md`, and new classes it finds are
  added there). The `pm-critic` sub-agent (dispatch skill `utility-pm-critic` upstream) runs on the
  PRD and again on the stage plan before any brief goes to an implementer; P0/P1 findings are fixed
  first. Decisions made in conversation are written down into `context/stage-<n>/briefs/` (the
  owner's `to-brief` skill; by hand: the decision, the alternatives that lost, open questions with
  their defaults), never left in the session. `iterate-retrospective` closes a stage and feeds
  `context/stage-<n>/ledger.md`. `product-brainstorming` (anthropics/knowledge-work-plugins) is for
  the problem space; `superpowers:brainstorming` is for the software design after the product
  decision.
- **Design has one source of direction**: `impeccable` (pbakaus/impeccable; its `PRODUCT.md` /
  `DESIGN.md` are the design context; Anthropic's `frontend-design` is not used in this repo).
  Reviewers report and do not set direction: `apple-design` (dickwu/apple-design-skill; HIG, both
  themes, phone and desktop), `web-design-guidelines` (vercel-labs/agent-skills; the `.web.tsx` /
  `global.css` / `src/platform/web` layer and the built head/manifest), and from
  emilkowalski/skills: `review-animations` (every reanimated/CSS transition; it has
  `disable-model-invocation: true`, so an agent reads its `SKILL.md` and `STANDARDS.md` from disk,
  or the owner invokes it as a slash command), `break-ui` (worst-case data per screen, always with
  a concrete target), `mobile-native` (the web build at 390×844).
- **Before pushing UI work**: screenshots of changed screens in both themes, both viewports, Russian
  text, reviewed by `impeccable critique`/`polish` and `apple-design`. The QA round from
  [docs/qa.md](docs/qa.md) stays as it is.

