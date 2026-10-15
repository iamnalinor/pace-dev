# Stage 8 — feedback round 4 (`pace замечания 4`, 2026-10-13)

## Context

The owner's fourth feedback document (20 screenshots) plus one extra screenshot (the composer refusing to add a task with "Type something first."). It asks for:
- UI polish;
- a renamed and reordered navigation;
- a unified sessions system (devices, browsers, agents, MCP) with login notices in Telegram;
- one notification pool (Login and Deadline Digest);
- automatic sleep tracking;
- free text that the assistant turns into create, edit or delete proposals, in the app and in the bot;
- our own desktop agent instead of ActivityWatch;
- the APK sent to Telegram after every release.

Breaking changes and a full database drop are explicitly allowed ("не хотим обрастать костылями"), and a refactor is approved. Everything goes in one PR on `claude/new-session-sy3n4a`, with a code review and Sonnet QA rounds (CLAUDE.md, docs/qa.md). Superpowers methods apply: TDD, systematic-debugging for each bug, and verification before claiming done.

Decisions taken in this session:
- **Desktop:** our own agent, no ActivityWatch.
- **Notifications:** the shared pool holds exactly two kinds, Login and Deadline Digest. Android keeps its local timers ("still doing this?", calendar start). In the app and on the web the pool is a feed in the app, with no Web Push.
- **Navigation:** sidebar order is Now → Day → Calendar (was Week) → Inbox → Projects → Insights → History → Settings. Phone tabs are **Now · Day · Calendar · Inbox · More**; More holds Projects, Insights, History and Settings.
- **Time bar:** the "What are you doing?" bar moves from Now to Day, since it now has a Task button. Now keeps one compact row for the running activity, with Stop.

## Answers to give the owner (in the final message)

- **APK size:** v0.9.0 is 25.3 MB (arm64). The bot can send it, since the limit is 50 MB.
- **Telegram release chat:** add a GitHub Actions variable `TELEGRAM_RELEASE_CHAT_ID` = `<owner Telegram id>` (Settings → Secrets and variables → Actions → Variables). I can't set it from here. The release step skips the send when the variable is empty.
- **Second Groq key:** the same secret `GROQ_API_KEY`, as `key1,key2`. Deploy's `tr -d '[:space:]'` currently glues keys separated by a newline into one key. The fix turns newlines into commas, and README L210 is corrected.
- **ActivityWatch:** it was simply easier, not necessary. We replace it with our own agent (Part H).
- **Why QA missed the "Type something first." bug:** the button and the action each had their own idea of "empty". Every test and every QA round entered tasks the same way (type the line, then Enter); none opened the empty form and typed in it. Fix: one predicate, and a QA checklist item covering every way into a form and every place a toast lands.

## Part A — bugs (TDD first, systematic-debugging each)

1. **Empty-form refusal.** `composer-form.tsx:230` uses `model.title`, while `createFromComposer` (`packages/client/src/actions/composer-actions.ts:119`) uses `model.isEmpty`, which is computed from the line text (`view-models/composer.ts:241`).
   - Fix: one `canAdd` on `ComposerModel`, read by both the button and the action.
   - Client test: the button is active ⇒ the action does not refuse.
   - e2e test: N, then a title, then Enter.
2. **The dissolved task flashes back.** `task-list.tsx` `settle` removes the id from `dissolving` before the store drops the row, so the progress resets to 0.
   - Fix: keep the id until the row leaves `rows`.
   - Shorten the wait before the rows below slide up: reflow starts as the dust ends, not after the close is persisted.
3. **Projects show "0".** `projects-screen.tsx:65` reads the Now filter chips.
   - Fix: count open tasks per project from state (a view-model function).
   - Label it "3 tasks", with plural i18n in EN and RU.
4. **The composer expand clips** its top text and button.
   - Fix: the title's autofocus scrolls the `overflow:hidden` box (`ui/animated-height.tsx`). Focus after the height settles, or use `preventScroll`. Verify in the browser.
5. **"Add a computer" does nothing on phones.** Find the root cause first. It goes away anyway with the new add flow (Part D).
6. **Toasts land over controls** (`ui/toast.tsx` is fixed at `bottom-24` and covers the time bar).
   - A toast avoids the screen's footer.
   - Explanations tied to a button use the new Tooltip instead (Part B).

## Part B — visual and navigation

- **Accent split** (`packages/core/src/design/tokens.json`):
  - `accent` becomes green/lime for important actions: New task, Create, Refresh, ▶, the logo and favicon. It uses dark text and is checked for contrast in both themes.
  - A new `accentQuiet` keeps the current indigo for quiet states: active tab, focus ring, switches, links, selected chips.
  - Update `contrast.test.ts` and `scripts/generate-icons.ts` (the logo goes back to lime chevrons), then regenerate the icons.
- **Update card** (`platform/update-banner.web.tsx`): a compact horizontal rectangle, "A new version of Pace" plus [Refresh page]. No Later and no detail line.
- **Navigation:**
  - Sidebar `DESTINATIONS` in the new order. Week is renamed Calendar: the route `/week` becomes `/calendar` and the feature folder `features/week` becomes `features/calendar`.
  - Phone tabs as decided, with a new More screen listing Projects, Insights, History and Settings.
  - The sidebar's Inbox row and the Inbox tab show a badge with the unsorted count. The counter button on Now (`now-header.tsx`) is removed.
- **Name from Telegram:**
  - The first name is stored (`users.name` already exists; add `firstName`) and returned by `/api/me`.
  - The sidebar header reads "Pace …… Albert". The phone shows it in More.
- **Tooltip primitive** (`ui/tooltip.tsx`, with a `.web.tsx` sibling):
  - On a computer it opens instantly on hover; on a phone it opens on tap. It is anchored to its control.
  - The Calendar button's text becomes "No calendar events around now".
  - Icon buttons use it for their hotkey hint.
- **Composer, simpler** (`features/now/composer/*`):
  - One line, with icon buttons inside it: Inbox (tray, ⌥↵) and Send (↵ arrow). No hint line and no chevron; the empty form opens with New task / N or a "+" icon.
  - The form header has no "Check before adding". It reads "New task" when typed by hand; when it comes from the assistant, the header says what is proposed (Part F).
  - On ≥1024 px the form opens in Now's right pane, where task details show, instead of stretching the list. On a phone it unfolds in place, with the clipping fix.
- **"Problems" → "Subtasks"** everywhere: i18n keys and any leftover identifiers. The subtask editor becomes a plain list with a "+ Add subtask" row, instead of the dashed pill.
- **Day list** (`features/day/day-screen.tsx`): one consistent row style.
  - Gaps become muted timeline rows with a "Log" link, not dashed boxes.
  - Dividers are the same between every row.
  - Run the design-critique pass on screenshots.
- **"Back to today":**
  - Day and Calendar show it only when not on today or this week.
  - The 48 px "This week" / "Today" button goes away.
- **Settings** (`screens/settings-screen.tsx`):
  - Buttons size to their content on a computer instead of filling the full width.
  - New order:
    1. preferences
    2. notifications (Part E)
    3. Devices and sessions, inline (Part D)
    4. Export data (moved down; Excel download; no extra description)
    5. Log out
    6. Danger zone: Wipe data, Delete account

## Part C — time bar and activities

- **Buttons** (`packages/core/src/tracking/buttons.ts`, `shared/tracking/time-bar.tsx`, `choices-sheet.tsx`): **Calendar, Task, Chores, Rest**. Sport is dropped. No ⋯, long press or right-click menu: a tap always opens the picker.
  - **Calendar:** today's events.
  - **Task:** a picker of open tasks in Now order, with search. Picking one starts Focus on it.
  - **Chores:** as now, minus Nap.
  - **Rest:** Short break 15m, Rest 30m, Walk 30m, Workout 1h, Nap 30m, Sleep 8h.
  - The "Alongside what is running" switch moves into the picker header.
- **The bar moves to Day.** Now keeps a compact running-activity row.
- **Free text in the bar** goes to the assistant first (Part F). It returns a proposal: start now, log a past span (e.g. "7:30 - 8:30 - ходил в военкомат"), edit or delete an activity. Enter confirms. Without the assistant, the rules reading (`core/tracking/typed.ts`, extended with time spans) fills the same proposal.

## Part D — data reset, unified sessions, login notices, Devices, 2FA wipe/delete

- **Drop everything:**
  - D1: a generated migration with the new columns, plus a custom migration that empties `users`, `sessions` and `login_nonces`.
  - DO: a `STORE_EPOCH` check in the `UserStore` constructor. On a mismatch it runs `deleteAll()` and migrates fresh; the DO migrations are squashed into a new `0000`.
  - Each store gets a random `storeId`, returned by `/api/sync/pull` and `/api/me`. A client whose `storeId` differs clears its local log and outbox, so old events never come back. Wipe uses the same mechanism.
  - Remove the dead pieces: the `observations` table and endpoint (nothing sends to it), and the retired `activity.button.*` events.
- **Sessions** (`apps/api/src/shared/db/d1-schema.ts`, `auth/sessions.ts`):
  - `kind` is one of `browser | app | agent | dev`.
  - `name` is derived: "Chrome on macOS" from the user agent, or "Pixel 9a", or the agent's computer name.
  - Also stored: `ip`, `country`, `city` (from `request.cf`), `userAgent`, and `deviceId` (links a phone or agent to its usage data).
  - For the deep link, the IP, country and user agent are captured at `POST /api/auth/nonce`.
  - New endpoints: `GET /api/sessions` lists D1 sessions plus the MCP grants from `OAUTH_KV` (kind `mcp`), marks the current one and adds last data for devices. `DELETE /api/sessions/:id` revokes either kind.
  - This replaces `device-routes.ts` listing and the separate `connected-apps.tsx` list.
- **Login notice** (as a Notification, Part E):
  - Text: "You signed in from Chrome on macOS, IP 1.2.3.4, Germany". The country is named with `Intl.DisplayNames` in the user's language.
  - Widget login: the bot message has a "Not me — end this session" button.
  - Deep-link login: the same message replaces the bot's current reply and keeps "Back to Pace" next to "Not me".
- **Devices and sessions, inline in Settings:**
  - A tidy list: icon by kind, name, "Last data …" (exact time when older than **8 h**), and a compact Revoke/Disconnect button.
  - Skeleton rows while loading.
  - "Add a computer" opens a sheet with a **Windows / macOS / Linux** picker and per-OS steps (Part H).
  - "Connect an AI app (MCP)" shows the MCP URL and the steps from `docs/mcp.md`.
  - The `/devices` screen goes away.
- **Wipe data and Delete account, with Telegram confirmation:**
  - The site confirms first, then calls `POST /api/account/confirmations {action}`. The bot sends "Confirm wiping all data?" with [Confirm] [Cancel]. The site waits ("Confirm in Telegram") and polls.
  - The bot's Confirm runs the action:
    - **Wipe:** the DO resets with a new `storeId` and default settings. The account, the sessions and the Telegram link stay.
    - **Delete:** the existing `DELETE /api/me` logic.
  - Confirmations expire after 5 minutes.

## Part E — notification pool

- **DO table `notifications`:** `id`, `kind` (`login | deadline_digest`), `createdAt`, `payload`, `readAt`, and the delivery state per channel.
- **Settings:** per kind × channel (Telegram / app / web).
  - Defaults: Login on all three; Deadline Digest on Telegram only.
  - Digest times stay as slots.
  - Quiet hours now only gate the Android timers. Login always goes out.
- **Deadline Digest** (pure, in `packages/core/src/notify/`):
  - At slot S, with the next slot N, it lists open tasks with `dueAt ≤ N + 24h` that were not yet reported for that `dueAt`. A task is therefore announced while it still has at least 24 h left; a task created late with less time left is announced at the next slot.
  - An empty digest is not sent. A late slot keeps the existing 90-minute rule.
- **Removed:** critical, stuck, the old digest, the long-run Telegram message, deadline crossings in Android's `notify/plan`, and the sleep and calendar-ended Android notices.
- **Kept (Android local only):** the "still doing this?" timer and calendar-start reminders.
- **Feed:**
  - A bell with an unread count in the sidebar header and the phone header.
  - `/notifications` lists them and marks them read. It replaces "Notification log"; the assistant's decision log stays reachable from that screen.
  - On Android a new feed item raises a local notification when the app syncs.

## Part F — assistant proposals (create / edit / delete), app and bot

- **Core** `packages/core/src/proposals/` replaces the half-used `PARSE_INTENTS`. A proposal is one of:
  - `task.create`, `task.update {taskId, patch}`, `task.delete`, `task.close`, `task.addSubtasks`
  - `activity.start`, `activity.log {start, end, category, label}`, `activity.update`, `activity.delete`

  `planProposal` turns a proposal into events. Delete is `event.revoked` of `task.created` (as the trash button already does).
- **API:**
  - `/api/parse` takes `{text, domain: "task" | "activity" | "auto"}` and returns `{domain, confidence, proposals[]}`.
  - The prompts in `apps/api/src/shared/llm/prompt.ts` and `activity-prompt.ts` get the open tasks, today's activities and their ids.
  - `verifyParse` checks that every referenced id exists.
  - LLM regression fixtures are extended.
- **App:** Now's composer (domain task) and Day's bar (domain activity) render proposals as cards:
  - "Create task" shows the editable form.
  - "Change «X»" shows a field diff.
  - "Delete «X»" asks for confirmation.
  - Enter or Apply applies them. Each card says that the assistant suggests it.
- **Bot:**
  - Free text uses `domain: "auto"`. Under a confidence threshold, the bot shows "Read as: task / activity" with a picker, then the proposals with Accept / Cancel.
  - `bot/preview.ts`, `describe.ts` and `choosePreview` are reworked around proposals. The deferred-parse queue keeps working.

## Part G — automatic sleep (server side)

- **Pure rules** in `packages/core/src/tracking/sleep-auto.ts`. Inputs: usage sessions from every device, activities, `now` and the zone.
  - **Open:** after the last use L in the night window (20:00–05:00), if nothing has been used for 60 min and there is no sleep yet that night, start a sleep activity at L. It gets a deterministic id `auto:sleep-<night>:start`.
  - **No duplicates:** nothing is created if a Rest-class activity is already running, which includes a sleep the person started; their start time is kept. Other running activities do not block it, and overlaps can be fixed later.
  - **Stop:** when use is seen after the start, stop any running sleep at the start of that use.
  - **Reopen:** if that wake lasted at most 15 min (a short break) and was followed by another 60 min with no use, revoke the stop. The sleep continues as if it never stopped.
- **Where it runs:** in the user DO after every usage upload, plus an alarm every 15 min in the night window. Each decision is logged.
- **Removed:** the phone-only `detectSleep` card and notice (`core/tracking/phone.ts`, `features/day/phone-section.tsx`, `phone-background.ts`).
- The phone keeps uploading usage, as it already does.

## Part H — Pace desktop agent (replaces ActivityWatch)

- `tools/pace-agent/pace_agent.py`, Python 3 standard library only. It samples the front app and idle time every 5 s, joins the samples into sessions, keeps a buffer while offline, and posts to `/api/usage/sessions` every 5 min with its agent token.
  - **Windows:** `ctypes` calls (`GetForegroundWindow`, `QueryFullProcessImageNameW`, `GetLastInputInfo`). Autostart through Task Scheduler at logon with `pythonw`; Python is installed with `winget` if missing.
  - **macOS:** `lsappinfo front` and `ioreg` `HIDIdleTime` (no Accessibility permission needed). Autostart through a LaunchAgent.
  - **Linux:** X11 via `xdotool`/`xprintidle` with `/proc/<pid>/comm`; on Wayland, KDE `kdotool`, and the documented limits for GNOME. Autostart through a systemd user service.
  - `--logs` prints what it would send.
- One install command per OS, generated with the token (the Add-a-computer picker). Rewrite `docs/desktop.md`; serve the script from the web build as the bridge is today; delete `tools/pace-aw-bridge`.
- Unit tests for session joining and buffering, with the OS probes stubbed.

## Part I — release and deploy

- **`release.yml`:** after publishing, `sendDocument` the APK to `vars.TELEGRAM_RELEASE_CHAT_ID` with the version and changelog link as the caption. It uses `secrets.TELEGRAM_BOT_TOKEN` and is skipped when the variable is unset.
- **`deploy.yml` L103:** newlines in the key lists become commas instead of being stripped. README L210 is fixed.

## Process and docs

- `context/feedback-4.md`: the document verbatim, with the screenshots described plus the extra screenshot.
- `context/user-messages.md`: this session's answers.
- `context/plan.md`: a Stage 8 section, the table of "what was done for each point".
- `docs/qa.md`: new checklist items: every entry point into each form × submit; where each toast or popup lands and what it covers; the light and dark themes and a phone width for every changed screen.
- `docs/architecture.md`: sessions, notifications, proposals, `storeId`, the agent.
- Commit per part (A … I), and run `bun lint` after every change.
- QA with Sonnet (docs/qa.md prompt, round 7+) runs in parallel with a code-review agent over `git diff origin/main...HEAD`. Fix the findings and repeat until only cosmetic ones are left.
- Before pushing UI changes, run design-critique, accessibility-review and ux-copy on screenshots: both themes, phone and desktop, with Russian text.

## Verification

- `bun lint`, `bun test:unit`, `bun test:api` and `bun test:app` are green.
- `bun test:e2e` is green, with new specs for:
  - N → title → Enter;
  - a proposal edit/delete through the fake LLM;
  - the sessions list and revoke;
  - the wipe confirmation through a simulated bot callback;
  - Calendar fitting with no scroll and the night toggle;
  - the Day buttons opening pickers.
- API integration tests: the login notice text (IP and country from a stubbed `cf`), the `storeId` reset, the digest selection, and sleep open/stop/reopen over usage fixtures.
- Manual pass in the browser through Playwright: screenshots of each changed screen.
