# Tasks 4.11–4.13 (batch 8) report

**Shipped.** Settings: inset grouped sections in spec order (account and language, notifications, tasks, devices and sessions, appearance, permissions and server on Android), `SectionHeader` + `Group`, links as `ListRow href`; a read-only Server row (host middle-ellipsized); a Keyboard row (web, where there is a keyboard); danger-zone openers are `destructive` buttons under a neutral heading; Revoke/End is a quiet `plain` button; time fields are content-sized. More: owner group, destinations group, Settings group (`ListRow`). Permissions, onboarding and not-found use the kit's Text roles; forgotten series rules are a `Group`. Copy: `glossary.test.ts` (banned phrases, pinned update/Calendar copy, one word per action); catalog fixes (update banner "A new version of Pace is ready." / "Refresh page", RU Undo «Вернуть», `assistant.approved` «Approved/Принято», EN "End session", "Sign in").

**Tests.** `middle-ellipsis.test.ts`, `glossary.test.ts`, Settings sections, updated outline/More/session tests. Bug-lessons: class 134, class 45 extended.

**Deviations / deferred.** See the plan's notes under 4.11 and 4.12. `task.giveUp` does not exist in the catalog; the RU Undo is compared with `review.action.cancel` («Отменить задачу»).

**Verify on hardware.** Settings at 390 in RU (notification matrix column headers), the Devices Revoke alignment.
