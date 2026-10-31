# QA round 10 — PR 2 web build

Tester: Claude exploratory QA agent, 2026-10-18, branch codex/pr2-assistant-activities. Stack: local Worker
(LLM_PROVIDER=fake, ENVIRONMENT=test), fresh state, web export on :4173. Scripts and screenshots: /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/
(sw-* = route sweep; every route at 1440 and 390, light and dark, RU lived-in account and fresh EN account, 152 pages: no page error,
no console error, no failed request, no raw key, no horizontal page overflow).

## Summary

| Severity | Count |
|---|---:|
| Blocker | 0 |
| High | 1 |
| Medium | 6 |
| Low | 11 |

Not testable here (fake LLM, no Telegram bot, no Android): real model parsing (deadlines, recurrence, project names, follow-up questions
were never produced by the fake provider), the Telegram confirmation completing, phone calendar, notifications on a device.

## Findings

### H1 high — «ем» (and «обедаю») is logged as Other, not Food
Now, 1440, light, EN account (and RU). Type «ем» in "What are you doing?", Enter, Approve; open Day. The block is tagged "Other" (same for «обедаю»).
Expected Food (owner request). The rule exists in core (categoryOfLabel) but the approved action does not use it on this path.
Typed in the task line instead, «ем» opens the New task form with Personal. Screenshot: /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t5-day.png

### M1 medium — Now: the long title is cut at ~90 characters
Now, 1440, any theme. Type a 250-character line in the task composer, Enter, Approve. Title becomes the first ~90 chars + "…", the rest goes to
the description; the proposal card also shows a cut title. Owner asked that the full typed title is kept. /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t3-2.png

### M2 medium — Settings switches have no visible keyboard focus and are 40x20
Settings, 1440 and 390, both themes. Tab to any switch (13 of them, also the "Parallel with current" switch): no ring, outline none; 20 px high is
under the 24 px minimum target. /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t27-switch-focus.png

### M3 medium — Proposal card shows too little to review
Now, 1440. "buy milk tomorrow", "cleaning the flat 30m", "gym 1h": the card says only "The assistant will create/start “…”". The 30m is
dropped silently; category, deadline, estimate, project are not shown. Approve is blind. With the fake provider nothing else is shown, so the
real-model card needs a recheck. /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t2-1.png, /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t4-5.png

### M4 medium — Phone: the time bar eats half of Now
Now, 390x844, dark, RU with 2 running activities: the bar is ~330 px (two rows with buttons, field, four buttons); the list shows ~1.5 tasks.
Should collapse the running rows or scroll with the list. /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/sw-ru-390-dark-_.png

### M5 medium — Destructive confirmations use the lime primary
Settings → Wipe data, 1440, light, EN. "Wipe — confirm in Telegram" is the loudest lime button, Cancel is outline. A destructive confirm should be danger-coloured.
Also "Delete for good" does not say it needs a Telegram confirmation (Wipe does); the error afterwards is the generic "Could not start the confirmation. Try again." (503 in this env). /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t20-1440-wipe.png

### M6 medium — Login via bot: waiting state is a dead end
/login, both widths. After "Log in with the bot instead" the tab goes to t.me; Back or reload keeps the pending state (works), but the only control is Cancel:
no "Open the bot again" link if the person returned without pressing Start. /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t23-390-reload.png

### L1 low — Description editor ignores Escape and outside click
Task screen, 1440/390. Click the description: Cancel/Save appear; Escape and a click outside leave the editor open with the draft. /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t14-390-a.png
### L2 low — Escape on the New task form with the calendar open closes the whole form instead of the calendar first. (The calendar itself closes correctly after a date and on an outside click.)
### L3 low — Escape does not dismiss the proposal card on Now (no keyboard way except Tab to Cancel).
### L4 low — New task form: "Deadline type" and "Repeat" show without a deadline; choosing "Main due + final deadline" first shows the red error "Set a main due date and a later final deadline." under Repeat, far from the cause, before any attempt. Date chips row (Starts now / No deadline / Default) has no label. /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t12-a.png
### L5 low — Day activity sheet: "Task" is both a category chip and the field label for the linked task; the estimate pill "Без оценки/20 м" is styled unlike the chips and has no way to clear it; "Другое: 50, 2,5 ч" placeholder is cryptic; with many apps Save/Delete fall below the fold of a scrolling dialog (1440x900). /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t9-1440-est.png, /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t7-1440-sheet.png
### L6 low — Apps lists repeat the device name on every row when there is one device; Week details list all apps (12) while Day caps at 5 + "Show all". /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t17-390-block.png
### L7 low — Calendar picker on the web: "Nothing on today in the calendar your phone sends (Pace on Android…)" and a "Calendar from the phone" button that leads to Devices (which has no calendar on the web). /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t15-390-Календарь.png
### L8 low — Sidebar user name is truncated to one letter ("D…") beside the avatar, 1440. /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t24-side.png
### L9 low — Offline: no indicator that the device is offline or that events are not yet synced (task added offline just shows). Rule-fallback banner is good. /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t25-1440-off.png
### L10 low — Presets: "На основе/Start from" chips and the list below both list the presets (chips open a new preset, rows open the edit); Settings mixes row-with-chevron (Presets) and full-width buttons (Devices). Toggle off-state in dark theme (picker, presets) is low contrast. /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t18-390-list.png
### L11 low — Toast after approving a task says only "Done" (vague; should say "Task created"). On desktop it covers the sidebar bottom. /tmp/claude-0/-home-user-pace-dev/45e9cc84-c2ce-5c93-8715-8e32a73db405/scratchpad/qa10/t3-2.png
Also: Insights tile label "Переключени/й в день" breaks mid-word at 390 (sw-ru-390-dark-_insights.png); /more and /add on desktop silently show Now.

## Owner requests

- Full link on the task screen: met (https://example.com/algebra ↗ under the title).
- Assistant uses existing projects only: could not verify (fake provider returns no project); "in project Nope" created no project.
- Full typed title kept: partly (M1).
- Calendar closes after a date and on a click outside: met (L2 aside).
- Quick description editing: works, Escape missing (L1).
- «ем» as Food: not met (H1).
- Category default "Default (1h)" only on the selected chip, replaced by a manual value: met (Homework 1h, Work 2h, Deferred 15m; 45m replaces it).
- Time bar on Now, Day without it; Now groups "With a deadline"/"No deadline": met. Parent chip opens a new preset: met. Login pending survives reload: met.
- Wipe/Delete confirmed in Telegram, notification/task links, avatar image, assistant follow-up questions: not verifiable here.

## What works well
No console errors or failed requests on 152 pages; RU and EN complete; Day edit sheet closes on Escape; apps used during an activity appear in Day sheet and Week details;
offline add with a rule fallback works and syncs back; presets, two-step deadline and recurrence controls are clear; Tab order sensible.
