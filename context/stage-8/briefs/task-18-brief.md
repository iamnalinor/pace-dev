# Task 18 — sweep the bug classes of stage 8 across the code, and add the guards

Owner: «после каждого найденного бага делать вывод почему существующими тестами мы его не отловили и как в целом нужно
улучшать свой подход к тестам чтобы отлавливать такие классы ошибок. сейчас это тоже примени. однотипные баги не хочется
каждый раз скидывать». The analysis is in context/bug-lessons.md (read it fully: ten classes, each with its rule).

For EACH class 1–10, in the CURRENT code (after the stage 8 tasks merged so far):
1. Sweep: search for other instances of the class (examples of where to look below), list each candidate with file:line
   and a verdict (real instance / not an instance, why).
2. Fix every real instance, test first (TDD), at the right level.
3. Add the class guard (the "Guard added" column of the log), so the class is caught from now on:
   - Class 1/2 (one decision in two places; one entry path): find every pair "UI enabled/visible" vs "action refuses" —
     grep for `disabled={` / `canX` / `isEmpty` and the actions' `err("…")` refusals in packages/client/src/actions; for each
     form (composer, task edit, close task, activity sheet, log past activity, project/preset forms, time-bar pickers) make
     sure enablement and refusal read one predicate; add property tests "enabled ⇒ accepted" where it applies; add a
     per-form entry-path table to docs/qa.md if missing.
   - Class 3 (async gap): every UI that holds transient local state around an async action (search `useState` near
     `await actions.` / `run(`: checking, dissolving, busy, optimistic rows, drag) — release on store change, not on call.
     Add a small test helper (deferred promise) in apps/app/src/test and use it.
   - Class 4 (borrowed numbers): every count/figure on a screen (badges, counters, "N tasks", totals on Day/Insights/Projects/
     Inbox) — each from a named view-model function with edge-fixture tests (0, 1, all in one group, nothing open).
   - Class 5 (layout/animation): every animated size/position (AnimatedHeight users, sheets, dissolve, row layout, the update
     strip): an e2e helper `expectStaysInside(page, child, container, during)` sampling bounding boxes during the animation;
     use it on the composer unfold and the sheet open at least.
   - Class 6 (overlays): an e2e sweep that triggers a toast / tooltip on each main screen (phone 390 and desktop 1280) and
     asserts its box intersects no enabled button/input (use `page.locator('button:enabled, input, [role=button]')`).
   - Class 7 (structure invariants): the route sweep runs signed out too (every non-public route → /login); check other
     wrappers that depend on folder placement (providers in (tabs)/_layout, ScreenScene) still apply to moved routes.
   - Class 8 (transitions): every hook reading storage/server once (`useEffect(..., [])` that reads AsyncStorage/SecureStore/
     fetch) — test the change while mounted; fix those that go stale (the onboarding one is being fixed in Task 3's fix round 2 —
     do not redo it; check the others).
   - Class 9 (time boundaries): every action that takes an instant from a calendar event, a notification, a quick-time chip or a
     typed time (attend, start at, log past, close at, due) — fast-check properties over offsets around now (−1 day … +1 day,
     incl. ±1 s, midnight, zone change); fix what refuses or misplaces.
   - Class 10 (dead control on a platform): every Pressable/Button on screens shown at phone layout has an app test that presses it
     and asserts a visible result — add a generic test that renders each phone screen (with a seeded store) and presses every
     enabled control, asserting no "nothing happened" (navigation, sheet, toast, state change, or an explicit allowlist with a
     reason). Find the root cause of "Add a computer does nothing on phones" if it is still reproducible in the current code and
     record it in bug-lessons.md.
4. Update context/bug-lessons.md: the Log's "Swept?" column from "pending" to what was found ("yes — 3 more fixed: …" / "yes —
   none found"), and refine a class rule if the sweep taught something.
Commit per class ("Bug class N: <rule> — swept, M fixed, guard added"). `bun lint`, `bun test:unit`, `bun test:api`,
`bun test:app` green; e2e specs you add/touch pass.

## Carried into this sweep (controller, 2026-10-14) — fix each test first, log in bug-lessons
From the pool re-review:
- notification-pool.ts:255 `withdraw` marks the Telegram delivery row dismissed even when the answer came from
  Telegram (message edited and kept) → feed says "Taken back from Telegram"; only mark rows actually withdrawn.
- Settings push picker: a way back to "Automatic"; follow `push-methods-changed` live (class 8); offline keeps the
  current method selected.
- Day's Skip ignores a failed `skipEvent` (use-day-phone.ts:218): keep it pending/retry or tell the person (class 3).
- fcm.ts:236: a 404 without UNREGISTERED is not "device gone".
- live-sockets.ts `replyCloseCode`: whitelist sendable close codes (1000–1003, 1007–1014, 3000–4999), else 1000.
- `wasDelivered` repeats "unavailable" rows while FCM is broken: log once per notification and method.
- bot.ts:136: a refused notification answer removes the Telegram buttons — keep them (class 3/Imp 6 pattern).
- README.md:318 Skip text; README push section mentions the Settings picker.
From the Task 6 re-review:
- Day's "Open task" links get an accessibility label naming the task.
- Calendar picker marks the running event (as Chores/Rest/Task do).
From the pool fix: closed enums in other answers — cloud device `kind`, sync `precision`/`source` — tolerant like
notify (core/api/tolerant.ts).
