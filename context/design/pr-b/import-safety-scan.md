# Import safety scan (a67cc50..4c24add)

Result: nothing dangerous found.

Checked on `git diff a67cc50 4c24add` (210 files, all in `apps/app`, `e2e`, docs/context, plus
`packages/core` design pairs and `dev` i18n catalogs, `scripts/eslint-all.ts`, `apps/app/global.css`,
`apps/app/app/(tabs)/_layout.tsx`):

- No changes to `.github`, git hooks, any `package.json`, `bun.lock`, `apps/api`, auth/session/sync
  logic, security headers.
- Added lines contain no `fetch(`, WebSocket, XHR, new URLs/hosts, `eval`, `new Function`,
  `localStorage`/`AsyncStorage`/`SecureStore`, cookies, `innerHTML`.
- Only `token` hits are design tokens and the existing e2e `loginViaApi` helper (local test API).
- Inline disables: two `eslint-disable-next-line security/detect-non-literal-fs-filename -- <reason>`
  (a test walking the app's own source tree), both with reasons. `@ts-expect-error` all with reasons.
- No `.skip`, `.todo`, `test.fail`, `xit`, `xdescribe` added. Tests: 418 added assertion/test lines
  against 60 removed (the removed ones are rewrites after renames); the only deleted file is
  `ui/pulse-dot.tsx` (a component).
- Lint ratchets in `scripts/eslint-all.ts` only went down (68→65, 32→28, 10→9).
