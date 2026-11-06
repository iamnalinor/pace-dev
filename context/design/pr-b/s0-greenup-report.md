# S0 green-up report (2026-11-06)

**Red and why**
- `bun lint` printed "eslint failed in app (no report)": ESLint's JSON report (large with 85 warnings
  carrying `source`) was cut short on the pipe. `scripts/eslint-all.ts` now reads it from `--output-file`.
- Ratchets measured lower than the merge arithmetic: design values 65 → 50, kit primitives 9 → 7, bare
  pressables 28 (exact).
- `tsc`: `IconButton variant="plain"` left in `overlay-frame.tsx` and `toast.tsx`. knip: 3 unused
  `*_ENTER` constants in `ui/motion.ts`. jscpd: 3 clones between `dialog`/`sheet`/`popover`.
- `tab-bar.test.tsx`: expected the old `left-5` class; the badge is on `BadgeAnchor` now.
- `app-state.test.tsx` (time-zone case): hard-coded `Europe/Moscow` as the "other" zone and asserts it
  differs from the device's; fails wherever the machine is in Moscow, so on a clean a67cc50 too (this
  machine is MSK; not re-run on a67cc50, the cause is the assertion on line 260). Now picks Tokyo there.
- Unit tests need `node` (vitest, jest shebang); this machine has none, so the run used a PATH shim to
  the ChatGPT install's Node 24 (`/tmp/opencode/pace/nodebin`). Under bun alone zod tests fail.
- `sessions.test.tsx` "puts the question above Cancel" timed out once at 5 s under full-suite load;
  passes alone and in the final full run (flaky under load, not changed).

**Changed:** shared `useOverlayProgress`, `overlayClosers`, `OverlayContent` in `ui/overlay-frame.tsx`;
tab bar and rail on `BadgeAnchor`; text-field class order (lint auto-fix); docs.

**Final:** `bun lint` exit 0 (0 errors, 85 warnings, all within the ratchets); `bun test:unit` core 878/878,
client 527/527, scripts and pace-agent OK; `bun test:app` 158 suites, 1170/1170. e2e not run.
