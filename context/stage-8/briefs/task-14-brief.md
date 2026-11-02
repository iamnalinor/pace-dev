# Task 14 — Part G: automatic sleep tracking on the server

Owner's words: «Еще насчет автотрекинга сна. Не нужно уведомлять «го затрекаем сон», если мы видим незатреканный слот, то
после некоторого времени активности на теле (вдруг я ночью проснулся, чет глянул и пошел дальше спать) – т.е. больше порога
небольших перерывов – мы заводим активность сна (давай всегда задним числом для простоты). Или не, лучше так:
- активность сна с открытым моментом окончания мы заводим в подходящее время после достаточно продолжительного перерыва в
  активности, и если сна в этом окне уже не было; моментом начала будет момент отсутствия активности на теле
- чел может завести активность сна сам, мы уважаем его момент начала;
- если видим активность на теле, завершаем активность в аппке. Но при этом если активности на теле и дальше нет и она подходит
  под критерий небольших перерывов в сне, то мы задним числом ту старую запись снова открываем (как будто она и не
  останавливалась).
- активность сна заводим даже если есть другая активность, кроме класса Rest. Если есть наложения, можно потом поподвигать даты»
(«тело» = the phone.)

Data available on the server: usage sessions per device in the user DO table `usage_sessions` (apps/api/src/user-store/
schema.ts; written by `POST /api/usage/sessions` from the phone's background task about every 30 min and from desktop agents
every 5 min; cloud-data.ts addUsage). Activities are events (activity.started/stopped/logged/adjusted…, category `sleep`
exists; Rest-class = categories rest and sleep — define the class in core tracking/categories.ts if not there). The phone-only
detector today: packages/core/src/tracking/phone.ts (detectSleep, SLEEP_MIN_MINUTES, WAKE_BLIP_MINUTES, night window),
apps/app/src/features/day/phone-section.tsx (the "Log sleep / Not sleep" card), apps/app/src/platform/phone-background.ts
(the sleep notice — Task 8 may already have removed the notice).

## Rules (pure, packages/core/src/tracking/sleep-auto.ts), constants named and documented
- Night window for a sleep START: 20:00–05:00 local (`SLEEP_START_WINDOW`).
- `SLEEP_OPEN_AFTER_MINUTES = 60`: no use on any device for this long.
- `SHORT_WAKE_MINUTES = 15`: a wake this short (use in total, from the first use after the sleep start to the last use before
  the next 60-minute quiet stretch) counts as a short break in sleep.
- Input: usage sessions (device, start, end) of all devices, the effective activities (running and finished) with ids and
  categories, `now`, zone, and `knownUntil` per device (the end of the latest upload window — the server knows the phone's
  data only up to its last upload; a decision must not assume quiet beyond what is known: use min over devices that uploaded
  in the last 24 h of their latest upload time; if no device uploaded since L, nothing is decided).
- Output: a list of decisions:
  - `open { at: L }` when: L = end of the last use in the night window; known-quiet from L for ≥ 60 min; no sleep activity
    (any source) started or running in this night (night = the 20:00→12:00 span L falls in); no Rest-class activity running.
    → `activity.started { category: sleep, label: "Sleep" (i18n at display) }` with occurredAt L and a deterministic id
    `auto:sleep-<YYYY-MM-DD of the night's start>:start` (extend EventIdSchema in core/ids.ts for this form — the regex allows
    `auto:<a>:<b>` already? check; `auto:sleep-2026-10-13:start` must match).
  - `stop { activityId, at: W }` when a sleep (auto or manual, running) has use starting at W after its start → stop at W
    (`activity.stopped` with occurredAt W, deterministic id `auto:sleep-<night>:stop-<n>` or `auto:<activityId>:stop-<W>` —
    choose a scheme that is unique per stop and idempotent across re-evaluation).
  - `reopen { stopEventId }` when the latest stop was caused by a wake that lasted ≤ 15 min and was followed by ≥ 60 min of
    known quiet → `event.revoked { targetId: stopEventId }` (deterministic id too) — the sleep continues as if never stopped.
    A later long wake stops it again (a new stop).
  - A manual sleep's start time is never changed.
- Idempotent: re-running on the same inputs yields no new events (deterministic ids + existing-event checks).

## Where it runs (apps/api/src/user-store)
After every usage upload (append) and on the DO alarm: during the night window + until 12:00, re-arm the alarm at most every
15 min (merge with the existing alarm scheduling in notifier.ts `rearm` — one alarm, earliest wins). Each decision is appended
through the same path as derived system events (`derive` in derive-steps.ts / apply with source "system") and logged in the
`decisions` table with its inputs (why).

## Remove
The phone-only sleep detector and its UI: detectSleep and constants that only it uses in core/tracking/phone.ts (keep what
other features use — check with grep), the Day card in phone-section.tsx (keep the rest of that section if it shows other
phone data), the background notice if still there, tests of removed code.

## Tests (TDD)
Core: scenarios with fixtures — (1) last use 23:40, quiet till 07:10 → open at 23:40, stop at 07:10; (2) wake 03:00–03:06 then
quiet → stop at 03:00 then reopen (revoke) — final effective state: one sleep 23:40→07:10; (3) wake 03:00–03:40 → stays stopped
at 03:00, a new open? (no — "if sleep in this window already was" → no new sleep; document this) ; (4) manual sleep started
23:00 → no open, stop on use, reopen on short wake; (5) a Rest activity running → no open; another category running (e.g. a
task focus left running) → open anyway; (6) phone uploaded only until 01:00 → nothing decided beyond 01:00; (7) idempotence.
API int: upload usage fixtures through POST /api/usage/sessions, run the alarm (as notifier tests do), assert events.
`bun lint`, `bun test:unit`, `bun test:api`, `bun test:app` green.
