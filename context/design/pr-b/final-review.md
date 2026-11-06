# PR #54 (design overhaul B): final review of the non-UI part

Range `a67cc50..36d94f4`, limited to the scope the owner set: `apps/api`, `packages/core/src/api`,
`packages/client/src`, `scripts`, test and build configs, CI, package manifests, `apps/app/src/platform`
and app state. Input: `.superpowers/sdd/redesign-plan/final-review.diff`, plus `git show`/`git diff` to
check `bun.lock`, the imported commits' footprint and the full `scripts/eslint-all.ts`. One pass,
read-only. No builds, tests, lint or e2e were run (the brief ruled them out), so "tests pass" below
means what the tests assert, not that I watched them run.

### Strengths

- **Batch 10 contract is additive on both sides.** `NonceCreateSchema` gets three optional, trimmed,
  length-bounded fields (`packages/core/src/api/schemas/auth.ts:2931-2934`). `SessionSchema.device` is
  optional, and `formFactor` falls back to undefined through `.catch(undefined)`, so a future value
  cannot break an older client (`packages/core/src/api/schemas/sessions.ts:2956-2964` in the diff).
  Old clients' `z.object` strips the new key. Old app builds send no fields, get no `device`, and keep
  `name` (`deviceOf` returns `undefined` when all three are null, `apps/api/src/auth/session-routes.ts`
  `deviceOf`; `sessionRows` falls back to `session.name`). Old browser rows already had `user_agent`,
  so they get details with no backfill.
- **Privacy is minimal.** For browsers nothing new is stored: the UA string was already kept, and
  `userAgentDetails` runs when the list is read. For phones only maker, model and OS version are
  stored, and nonce rows are swept by the existing expiry delete. Nothing new goes into logs or the
  Telegram sign-in notice.
- **The migration is safe to roll forward and back.** `0009_furry_ulik.sql` only adds nullable columns,
  the drizzle snapshot and journal were generated, and an older Worker that selects explicit columns
  ignores them.
- **The UA parser makes nothing up.** If the string does not carry a value, the field is left out:
  Windows 10/11 has no version, the reduced Android `K` and the Firefox `Mobile`/`Tablet` tokens give
  no model, and macOS/Linux have no version. The regexes are linear (no ReDoS shape). Tests use real
  UA strings.
- **ESLint report via file cannot let lint pass silently.** The full script still requires
  `run.exitCode === 0` *and* no ratchet problem before `continue` (`scripts/eslint-all.ts:101-107` in the
  tree). A crash with no report exits non-zero through the `catch`. A crash with a stale report still
  fails on the exit code.
- **The ratchets only went down**, both in the imported commits (68→65, 32→28, 10→9) and here
  (→24, →6, →2).
- **The safety scan's "nothing dangerous" claim holds for my scope.** In my scope the four Hentrixz
  import commits touched only the `eslint-all.ts` ratchet constants (all lowered) and
  `submitFieldProps` in `apps/app/src/platform/enter-key*.ts`, which only sets `submitBehavior`/`blurOnSubmit`.
  They add no hosts, `fetch`, `eval`, CI, hooks or dependencies.
- **Env independence is real.** Playwright is pinned to `timezoneId: "UTC"`/`locale: "en-US"`. Core and
  client vitest set `TZ=America/Los_Angeles` in config, and with forked workers the setting reaches the
  workers. `packages/core/src/tz-guard.test.ts` pins it.
- **The view-models are pure and well tested.** `layoutWeek` computes lanes on the same min-height the
  boxes are drawn at, which answers F-DAT-05 and class 1 (one source of geometry). `dayRail`'s
  capped-gap clock is tested for proportional `nowAt` inside a capped gap. `submitLabel` keeps data
  from setting a button's length (F-DAT-01).

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

1. **A phone whose `expo-device` values exceed the schema bounds cannot sign in at all.**
   - File: `apps/app/src/platform/phone-details.ts:1704-1718` (diff lines), against
     `packages/core/src/api/schemas/auth.ts:2932-2934` (diff lines).
   - What's wrong: `phoneDetails()` trims but never clips. The server's `strictObject` rejects
     `deviceBrand` > 40, `deviceModel` > 60 or `osVersion` > 20 characters. With these fields in the
     body the whole `POST /api/auth/nonce` fails validation (400), so the bot login never starts.
     Custom ROMs and some OEM builds do report long `Build.MODEL`/`VERSION.RELEASE` strings.
   - Why it matters: three cosmetic, optional fields can now take away the only way to sign in on
     Android. That is a worse failure than a missing device name. The old `deviceName` (80 characters,
     `phone-name.ts` does not clip it either) already had the same flaw, so this is a class, not a
     one-off.
   - Fix: clip on the client to the schema's bounds by grapheme (core's `clipText`), for `deviceName`
     too. Export the bounds from core so the two sides share one number. Optionally have the server
     drop a bad optional field instead of rejecting the body: `.catch(undefined)` on each of the
     three. Add an int test that a 200-character `deviceModel` still opens a session. Record the class
     in `bug-lessons.md` ("an optional descriptive field fails the whole request").

#### Minor (Nice to Have)

1. **`strictObject` makes a new APK fail against an older Worker.** In
   `packages/core/src/api/schemas/auth.ts:2927` an older server rejects the new keys. The usual order
   (Worker first, APK later) makes this harmless, but a Worker rollback after the APK ships, or a
   self-hosted older server (the app has a server row), breaks login. This goes away with the Important
   fix's server-side `.catch`, or with a note in the release checklist that this Worker must be live
   before the APK goes out.
2. **A stale ESLint report can be printed as if it were current.** In `scripts/eslint-all.ts:3085-3107`
   (diff) a crashed run with an old `.cache/eslint/<part>.json` prints the previous results before it
   fails. The exit is still correct, but the output misleads. Delete the report before
   `Bun.spawnSync`.
3. **`deviceOf(row)` is computed twice per row**, and the UA is parsed twice
   (`apps/api/src/auth/session-routes.ts`, `fromRow`: `...(deviceOf(row) !== undefined && { device: deviceOf(row) })`).
   Bind it once.
4. **The user's own phone name disappears from the sessions list.** `sessionRows` replaces
   `session.name` with brand + model whenever a model is known (`packages/client/src/view-models/sessions.ts`
   `name: details.title ?? session.name`). `Constants.deviceName` is the name the user can set ("Ada's
   phone"). It is now shown nowhere in the list, while the Telegram sign-in notice still uses it, so
   one session has two names. This matches the owner's request; flagged so the owner confirms.
5. **Old Android UAs give a locale as the model.** In `apps/api/src/auth/user-agent.ts` `androidDevice`,
   "Linux; U; Android 4.0; en-us; GT-I9100 Build/…" yields model `en-us`. Rare today; skip a
   `^[a-z]{2}-[a-z]{2}$` token.
6. **`export * from "./view-models/week-layout.ts"`** (`packages/client/src/client.ts:1854`) breaks the
   barrel's explicit-export style and exports every helper type. List the names.
7. **The TZ setting is not guarded everywhere.** The time-zone guard test exists in core only. The
   client's vitest and the app's jest (`"test": "TZ=America/Los_Angeles jest"`) rely on config or a
   script prefix that a bare `bunx jest` or an IDE runner bypasses. Set TZ in the jest config or
   `globalSetup` and add the same one-line guard.
8. **Some batch 10 behaviour is not pinned by a test.** No int test covers a too-long or whitespace-only
   new field. No int test checks that an old-style nonce body (no new fields) lists no `device` for
   the app row. No unit test covers `phoneDetails`.
9. **`bun.lock` was also rewritten beyond the new `expo-device` dependency.** `ua-parser-js` hoisting
   flipped from 1.0.41 to 0.7.41 (the version `expo-device` needs; `fbjs` keeps 1.0.41 nested; 0.7.41 is
   after the 2021 compromised 0.7.29). The `libc` keys of the native bindings were dropped, which
   looks like a different Bun version. Integrity hashes are present, so this is benign, but it is
   worth one line in the PR body.

### Recommendations

- Treat "client-sent descriptive metadata must never block auth" as a rule: clip it on the client,
  and on the server, tolerate it or drop it per field.
- Run the session-row title against `break-ui` worst cases (60-character model, RTL/bidi characters
  in a model) once the clip lands. The values are rendered as RN `Text`, so there is no injection, only
  layout.

### Declined to judge

- **Bot deep-link phishing.** Nonce creation is unauthenticated, so anyone can mint a nonce with an
  arbitrary model and send the link to a victim. This is pre-existing with `deviceName`, and the
  bot-side confirmation flow is out of this diff's scope. The new fields add only cosmetic spoofing
  of the row title.
- **Hard-coded `os: "Android"` for app sessions.** The app ships for Android only (CLAUDE.md). An iOS
  build would need this revisited.
- **UI consumers** of `formFactor`, `useCalendarRange`'s new `RangeRead` return type, `submitLabel` and
  `layoutWeek` (screen files). Out of the owner's scope; typecheck covers the signature change.
- **`apps/app/app.config.ts` notification colour and `tokens.json` `motion.highlight`.** Design values,
  not risk-bearing.
- **The geometry details of `dayRail`/`layoutWeek` beyond their tests**, such as blocks clipped at
  `fromHour` getting lanes from the raw stretch. That is conservative (it can cost an extra lane, never
  causes an overlap), and judging it further would mean reading screens.
- **Whether builds, tests and lint are green.** Not run, per the brief.

### Assessment

**Ready to merge?** With fixes

**Reasoning:** The contract change is additive, keeps old rows and old apps working, stores little, and
the ESLint change cannot let lint pass silently. The imported code in scope is harmless. Fix one thing
before merge: an over-long `expo-device` value currently blocks Android sign-in entirely, so clip it on
the client and tolerate it on the server.


## Fix wave

Each finding was checked against the code before it was fixed (`receiving-code-review`). No pushback: all
of them were right.

| Finding | Result | Commit |
|---|---|---|
| I1 over-long optional device fields block sign-in | Fixed on both sides. Client: `cleanLoginDevice` trims, clips by grapheme to `DEVICE_FIELD_LIMITS` (exported from core, one number for both sides) and leaves out blanks and an over-long id; `deviceName` included. Server: every descriptive field and `deviceId` of the nonce body is dropped when invalid (`droppedIfInvalid`), never a refused login. Tests: core schema, api int (too long, blank, wrong type, mixed valid and invalid, old-style body), client unit. bug-lessons class 136 (swept: `NonceCreateSchema` was the only login body with optional metadata; `cloud.ts`'s upload `deviceName` is a required field of an authenticated upload and stays strict) | `1c5f631` |
| M1 `strictObject` fails a new APK on an older Worker | The nonce body ignores unknown keys now (a newer app's body is accepted from here on), and for the Workers already out the client asks again with only `deviceId` and `deviceName` on a 422 (`createNonce`). Unit test | `1c5f631` |
| M2 stale ESLint report | `clearReport` before each run, `readReport` answers nothing for an unreadable file, "no fresh report" fails loudly; `scripts/eslint-report.test.ts` | `e02c90b` |
| M3 `deviceOf` twice per row | Bound once | `1c5f631` |
| M4 the user's phone name vanished from the list | A phone app's own name is the title (the "Android" fallback of the Worker is not a name); its model goes under it unless the name already says it. Unit and screen tests | `7880e85` |
| M5 locale read as the model | The token is skipped and the next one is the model (`en-us; GT-I9100` gives `GT-I9100`; a bare locale gives none). Tests | `7880e85` |
| M6 `export *` of week-layout in the client barrel | **Left**: listing the three names takes `client.ts` over its 300-line limit; needs a split of the barrel | |
| M7 TZ guard | Client vitest and app jest have the same guard test; jest sets `TZ` in a `globalSetup` (untransformed: a babel-transformed one broke a suite), so a bare `bunx jest` is covered | `e02c90b` |
| M8 untested batch 10 behaviour | Api int tests for a too-long and a whitespace-only field and for an old-style body (no `device` on the row). `phoneDetails` is covered by the client clip test only (it needs `expo-device`, no unit test written) | `1c5f631` |
| M9 `bun.lock` rewrite | **Left**: one line for the PR body (ua-parser-js hoisting 1.0.41 to 0.7.41 for `expo-device`, `libc` keys dropped by another Bun) | |

### CI rounds

| Run | Commit | Result | What was fixed |
|---|---|---|---|
| `42230059145` | `36d94f4` | in progress when the wave started, cancelled by the push | |
| `42235216715` | `e02c90b` | e2e red: 45 failed, the job hit its 35 min limit before the rest ran (checks green) | Specs that still drove the old screens: Delete from the task page (now ⋯, Delete the task, Delete; helper `deleteOpenTask`), one `shell-content`, `searchbox` for the task search, a switch's ring on its small visual, 44 px targets, sheets where a computer has popovers, 500 events a push, the Calendar sheet selector. Real faults: a popover with no height opened below a bottom-edge tile and left the window (`Popover` measures its frame); the unread dot was an unnamed `div` with a label. CI timeout 35 to 60 min and the report is uploaded always. bug-lessons class 137 |
| `42244521450` | `242dd8b` | e2e red: 32 failed, 185 passed (21.8 min) | Real faults: a labelled separator directly in a list (axe `aria-required-children`; now in a list item, also the gallery's notification), busy spinners without a name (hidden from readers), a read-only field not disabled to readers, `EmptyText` with no ink colour (black on dark), the period stepper's hidden reset and next controls not `aria-hidden` (still found by role), a ring outside a field counted as a box leaving the card. Specs: infinite animations (a skeleton's breathing) are no animation to wait for, colour scans repeat while a fade settles, chips run by name, the phone tab bar is a navigation too, `Approve` scrolled into the bar's budget |
| `42253304494` | `c1f5912` | checks red: `bun lint` had left one formatting fix of `e2e/sheet-focus.e2e.ts` uncommitted (CI's clean-tree check); e2e did not run | the fix |
| `42254526190` | `e8ead2d` | checks green; e2e red: 18 failed, 199 passed (23 min) | stopped: the three-round budget is spent |

### Still red at `e8ead2d` (18 tests in 9 groups)

1. `journeys` x2 (phone, desktop): the check circle of a fresh task does nothing (no dust, no close) when clicked
   by the test; the row stays unchecked. Cause not found from the screenshots (Dissolve / nested Pressables in `ListRow`).
2. `overlays` "preview shows whole inside the card": the assistant's preview line leaves the card by up to 3 px
   for some frames while it unfolds (bug class 5).
3. `overlays` tooltip sweep: the bell's tooltip («Уведомления: Новая задача») covers a control on Now, Day and the task page.
4. `route-sweep` x4 (phone): words broken across lines on `/dev/gallery` («ASAP», «Submit 1 and 2», a "3" leaving
   its button) and on the task page in Russian («Сдать 290», «Готово»). Real text-fit faults of the new buttons.
5. `scale`: p95 frame 83 ms for the 1 050-row fold (budget 32 ms; the run before read 33 ms): a real perf finding, budget left as it is.
6. `sheet-focus` x2: desktop (a sheet opener left that is a popover or pane now) and phone (Week's block button, name changed).
7. `week` x4 and the 23:56 test: the sheet's `Close` button the test clicks at (5, 5) no longer exists (the dim is
   not a button any more); the 23:56 item ends below the scroller.
8. `worst-case` x3: meta lines of task rows ("осталось 1 ч 30 мин · осталось 3 подзадачи") and tags overflow
   their box at 390/320 where the allow-list expects none; the allow-list or the row clamp needs a decision.
9. The `latency` step has not run in any round (it runs after a green chromium project).
