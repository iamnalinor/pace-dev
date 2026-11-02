# After PR #48: follow-ups (to do; written 2026-11-02 at merge)

The owner froze PR #48's scope after fix round 7: only critical and high findings were fixed there.
Everything below is medium or lower, an owner action, or a known limit. It was found by QA rounds
20–21, the round 6–7 reviews and the implementers. Each item gets the usual treatment when picked up:
TDD, a bug-lessons row, trace the other side of a contract.

## QA round 21 (`context/qa-round-21.md`, read the steps there)

- **M1:** Enter in a single-line field of a sheet submits nothing and drops focus to the body behind
  the dim. Affected fields: the close sheet's Reason and typed time, Day's activity sheet (What, From),
  Edit task's Title. Enter should submit the sheet; focus never leaves it.
- **M2:** a direct load of `/add` (the manifest's share and shortcut URL) opens New task with no field
  focused, so typed text is lost.
- **M3:** the time bar's "could not read" line ignores the parse `reason`
  (`limited|unreachable|unreadable|off`). The composer already uses it; `readingIssue` should too.
- **M4:** a first pull answered with HTTP 500 on an empty copy leaves Now on "Nothing to do right
  now.", with no strip, no Retry and no word. A 5xx on the first pull should read like "not synced
  yet", with Retry.
- **L1:** radio groups that are still one tab stop per chip: Settings theme and language, Now's
  project filter, New task's Start and Repeat, the activity sheet's categories, the preset editor.
  Move them to `RadioChips` (class 84 sweep).
- **L2:** the close sheet changes height in one frame on an outcome switch (animate it, or keep the
  height). QA 20 L6 remains.
- **L3:** Day's activity sheet offers tomorrow as an end day, which is always refused. Don't offer it.
- **L4:** preset names are not unique; a second "Work" gives two identical chips.
- **L5:** two identical `GET /api/usage` on Day's first load (QA 20 L9 sweep).
- **L6:** the "public address differs" line under the MCP URL names neither address nor what to do.
- **L7:** the rules' preview card says only "Assistant unavailable" for every reason.
- **L8:** close sheet copy: "Outcome" appears twice, and the summary says "Done" under "Submit".
- **L9:** the offline pill wraps to three lines (62 px) in Russian at 390 px and covers rows.
- **L10:** ⊘ and "Other time…" open the same sheet (one way per job).
- **QA 20 L5:** the typed date and time in the close sheet are still text boxes, not the app's
  pickers.
- **Cosmetic, still open:**
  - the Devices confirm row's Revoke is 8 px off;
  - the close sheet's tight rule;
  - Presets' "Start from" has no verb;
  - "Signed in from Dev login" entries in the bell (a dev artefact).

## Review of round 7 (a217c37..a76bf6e)

- **#2:** a deferred text queued with `retryAt: null` is retried every 5 min for up to a day, even
  when a provider refuses it for good (400, content filter, context length). Count tries and move it
  to the Inbox after a few races with no `retryAt`, or send our-request failures to the Inbox.
- **#3:** the `LlmHealth` DO read has no timeout, and it sits on the parse and bot path (7 s budget).
  Race it against about 1 s, and cache `{}` briefly on failure.
- **#4:** root `questions` is no longer filled when absent. The LLM smoke on the branch didn't
  trigger it. Watch the regression runs, and fill only root `questions` if a slot leaves it out.
- **#5:** the signed-out route sweep drops every refused response. Allow only the 401 of the
  session check.
- **#6:** the offline pill and the toast share one spot; the toast covers the pill and its Retry.
  Stack them, and add an e2e for offline plus a toast.
- **#7:** after `HOLD_WAIT_MS` a hung run can land after the revoke and read as "ended elsewhere".
  Abort it, or ignore 401s for the token being ended.
- **Minor:**
  - the 2 s quiet window misses a 3–5 s repeat loop;
  - `startSenders` on the failed-revoke path starts the socket in a hidden tab;
  - after "Read it when it's back" the preview's decision stays open in `/decisions`;
  - the drain could wait for the earliest health penalty instead of 5 min.

## From the implementers (rounds 6–7)

- **Account-bound defaults during the first sync:**
  - `/add` during the first sync shows New task's built-in defaults (presets, project, importance).
    Same class as the Settings and Week fixes (class 62).
  - An empty account that can never sync keeps Settings and Presets grey for good. Accepted, since
    Log out stays reachable; revisit if it confuses people.
- **Self-hosting and addresses:**
  - `/.well-known/oauth-protected-resource/mcp` answers 404 when the Worker is reached at a host
    other than `API_ORIGIN`.
  - The MCP URL vs the agent's `--api` can differ for a self-hoster reached at another host (see
    class 83 and 102).
- **Touch and layout:**
  - Chip rows give about 40 px of real press area, with their 44 px boxes overlapping the next row
    (6-B, swept partly).
  - Past six lanes, a phone's Week lanes get narrower than 44 px (the tooltip names the block).
  - The sidebar keeps Settings highlighted on New preset.
- **Data:** two devices creating the same preset name offline get the same id.
- **Tooling:**
  - Lint autofix can turn `() => inFlight` into `async () => await inFlight`; it once made
    `sync.hold` loop forever. The tests caught it. Find or add a lint rule.
  - `ids-no-prng.test.ts` timed out once under load (5 s default).
- **CI:** e2e went from about 6.5 to about 12.5 min with the route-sweep matrix (2 workers, private
  repo runners).

## Owner actions

- Replace LLM slot 3's second key (`LLM_API_KEY_3`'s second entry answers 401 Invalid API Key) in
  GitHub secrets.
- Slot 1 (nekocode) still answers 503. The health memory now puts it last; drop or replace it if it
  stays down.
- Android device checks for the release: the checklist in `context/`, plus the night sleep, the pool
  notifications and the share intent on a phone.
- A real signing keystore (`ANDROID_KEYSTORE_BASE64`).

## Carried over from earlier rounds (owner list)

- **Sleep:**
  - Pool answers (Attend/Stop, recorded as system) are not counted as awake signs.
  - A live non-Rest activity started at night, followed by a quiet phone, becomes a 0-minute
    activity (no desktop signals).
- **Data:** spells and `usage_sessions` are still readable through `query_sql` (M6).
- **Notifications:**
  - Delivery retries every 60 s while a channel is down.
  - The remaining real-clock notify tests (class 54 candidates).
- **App:**
  - A brief English nav on a warm Russian reload.
  - `undoLast` across tabs.
  - Existing series keep their creation-minute start.
- **Release:**
  - `PACE_VERSION` should show the tag after a release.
  - The QA15 L16 and QA16 L11 leftovers.

## Briefs already written for the next iterations

`context/firebase-from-server-plan.md`, `ota-updates-plan.md`, `infra-portability-plan.md`,
`cold-storage-plan.md` and `android-e2e-plan.md`. Not planned: `telegram-oidc-plan.md`.
