# Global constraints (every task)

Repo: /home/user/pace-dev, branch claude/new-session-sy3n4a. Read /home/user/pace-dev/CLAUDE.md first and obey it:
- Bun only (bun install / bun run / bunx). Never npm/npx/yarn.
- After every change run `bun lint` (auto-fixes) and fix everything it reports. Never run biome/eslint/tsc/knip separately. Never disable a lint rule inline without `-- <reason>`; never weaken a rule.
- TDD for behaviour changes; test levels per docs/testing.md: `bun test:unit` (core, client), `bun test:api` (Worker), `bun test:app` (jest-expo). e2e (`bun test:e2e`, Playwright, Chromium at /opt/pw-browsers/chromium, never `playwright install`) only when the brief asks.
- Never skip or delete a failing test (deleting tests of removed behaviour is fine).
- Architecture (dependency-cruiser): core pure/immutable, no workspace imports; client imports core + only *types* of api; apps never import each other; API feature folders share only through apps/api/src/shared.
- Event sourcing: user actions are immutable events; corrections are event.amended / event.revoked. Never mutate projections directly.
- Errors: pure code returns Result<T,E> with string-literal codes; HTTP maps them with exhaustive switch (no default).
- API contract first: routes are zod endpoint() in packages/core/src/api/endpoints.ts, mounted with mount() from apps/api/src/shared/mount.ts. Read bindings from c.env.
- DB: change d1-schema.ts / user-store/schema.ts then `bun db:generate`; commit SQL; never hand-edit applied migrations or drizzle meta.
- Every UI string goes through t() from @pace/core; EN source catalog, RU mirrors it (keys must match; i18n files under packages/core/src/i18n/{en,ru}/*.ts). User content never translated.
- App imports use #app/*; packages and API use relative imports.
- One UI for Android + web: web-only code in .web.tsx siblings or src/platform/web/; never `Platform.OS === "web"` for whole screens; never import a .web.tsx from its own base.
- Code, comments, identifiers in English. Match surrounding code style and comment density (doc comments in this repo are full sentences, explaining why).
- Commit with clear messages ending with these two trailer lines exactly:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NRL78CKNGuWkrUZqvgbCNk
  Never put a model id anywhere else in commits or code. Do not push.
- You never dispatch subagents.
- e2e: the installed Playwright expects a newer Chromium build than the one present; run e2e with
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome bunx playwright test <file>`.
- Commit trailer: use the Co-Authored-By line your own session's attribution instruction gives; keep the Claude-Session line.
