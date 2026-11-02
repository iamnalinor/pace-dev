# QA round 12 — verification of the round 11 fixes (folded bar, monthly deadline, button growth, Task picker)

Tester: Claude exploratory QA agent, 2026-10-31. Web export built from `5aa3565` (HEAD, clean tree). Stack: local Worker :8797 (`LLM_PROVIDER=fake`, `ENVIRONMENT=test`,
fresh `--persist-to .cache/qa-state-12`), web on :4183 from a private build in the scratchpad (the shared `apps/app/dist` was not touched). The mock-LLM worker (:8798) was not
needed: none of the checked areas depends on model output. Accounts: 7001 RU lived-in (an activity "Пошёл в ЦСС" and a parallel "Музыка" running), 7002..7008 fresh EN.
All scripts and screenshots: /tmp/claude-0/-home-user-pace-dev/35bc1c82-fe54-55b9-b221-7cf8441289b9/scratchpad/qa12/ (abbreviated `qa12/` below; every path in this file is under that directory).

Route sweep (`sweep.ts`): 22 routes on the RU lived-in account and 18 on the EN account x 1440/390 x light/dark = 160 pages: no page error, no console error, no failed request,
no horizontal page overflow, no empty page. The raw-key scan reports only `/decisions` on EN (`parse.activity.start`, the round 11 M4, now visible because this EN account made typed starts).
axe (WCAG 2.2 AA, 12 RU + 10 EN routes x 4 combos): `scrollable-region-focusable` on `/insights` RU 390 (round 11 L8, unchanged) and `target-size` on `/week` EN (N1 below, caused by the test data).
A DOM scan of every button on 15 routes x 2 languages x 2 sizes x 2 themes found no label that leaves its button and no button taller than 80 px (the only tall hits are the Week blocks).

## Summary

| Severity | Count |
|---|---:|
| Blocker | 0 |
| High | 0 |
| Medium | 0 |
| Low | 3 |

New findings: 3 low. Round 11 H1, M3, M5, M6 are fixed. Round 11 M1, M2, M4 (medium) were not part of this fix pass: M4 was seen again (raw `parse.activity.start` rows on `/decisions`), M1 and M2 were not re-tested.
Not testable here: Telegram confirmation completing (Wipe/Delete answer "Could not start the confirmation" without a bot), a real model, Android.

## Round 11 fixes, verified

### H1 (folded bar on a real load) — fixed
- 390x844, RU lived-in account, light and dark, three loads each (cold, reload, reload): the bar is folded from the first poll at 500 ms to 4 s: the running rows, one "Начать другое" row, no field, no buttons, three tasks fit above. (`t1.ts`; qa12/t1-ru-390-light-cold.png, qa12/t1-ru-390-dark-reload.png.) Same on EN with "Walk"/"Reading" running, light and dark (`t7.ts`, qa12/t7-en-390-dark-cold.png). Day -> Now and 768 px (phone layout) also come up folded; resizing to 1440 shows the field and no toggle, back to 390 it is folded again (`t14.ts`).
- Unfold, type "half typed text", fold, unfold: the text is still there (`t2.ts`, light on 7002, dark on 7003; qa12/t2-light-unfolded-text.png).
- Start from a button's picker (Rest > Walk, with nothing running): the bar stays open, also after 6 s. A second start from another picker (Chores) and from the typed field ("Reading", Enter) while something runs: stays open. Task picker (Every3): stays open (`t6.ts`). A replacing start (Rest > Nap while Walk runs): stays open (`t13.ts`).
- Stop of every running activity: bar open, no toggle. A typed start from idle ("Typed idle start"): open and stays open after 6 s.
- Starting from elsewhere folds an open, untouched bar: an activity pushed as the bot does (`/api/sync/push`, source `bot`) folds the bar within 1 s (`t3.ts`, qa12/t3-light-elsewhere.png); Focus on a task's own screen and back to Now: folded (`t6.ts`, qa12/t6-dark-back-now.png).
- Not folded by design (observation, not a defect): a second parallel start from elsewhere while the person has unfolded the bar by hand leaves it open.

### M3 (monthly deadline) — fixed
EN, 1440, light. New task "Jan31 monthly", deadline Jan 31 2027 (three months ahead), Repeat "Every month", Create (today Oct 31). The next instance reads "Starts Nov 30 16:32 · Due Feb 28 2027 23:59" (was Mar 2).
Closing each instance in turn: due Jan 31 -> Feb 28 -> Mar 31 -> Apr 30 -> May 31 2027, no drift (`t15.ts`, `t4.ts`; qa12/t4-task-screen.png). Weekdays on a Sunday due date gives Monday (Dec 6 -> Dec 7), Every N days moves due and start by the same N.
Still as in round 11 (not a regression): the next instance's start takes the creation time of day (16:32), which the person did not choose.

### M5 (danger buttons in Russian) — fixed
Settings > Опасные действия, RU, 390x844, light and dark: «Очистить — подтвердить в Telegram» is 205x77 px and «Удалить — подтвердить в Telegram» 205x77: the button grew, the label is centred and fully inside (programmatic check: no text box leaves its button). EN at 390: 205x58 (two lines), 1440: 532x48 one line. (`t8.ts`; qa12/t8-ru-390-dark-wipe-confirm.png, qa12/t8-en-390-light-delete-confirm.png.)
Other screens: Settings (first screen), Now, assistant card, New task form, Day, Inbox, Projects, new project form, Devices, Review, Presets, onboarding, login: every Button is still 48 px with a centred label; pixel diff against round 11 shows no change on screens without a wrapping label (Settings, Projects, Inbox, Devices, Presets, Review are identical to round 11). (`t9.ts`, `t10.ts`; qa12/t10-ru-dark-card.png, qa12/t10-ru-dark-newtask.png.)

### M6 (Task picker tells instances apart) — fixed
Time bar > Task, EN 390 dark and 1440 light/dark, RU 1440 light and 390 light/dark: each row has a second line with the deadline ("Due Dec 6 23:59 · 1mo 6d left"; future instances "Starts Nov 2 16:32 · Due Dec 7 23:59 · 1mo 7d left"; RU "Срок завтра 16:28 · осталось 23 ч 54 м", "Начало 5 нояб. 16:28"). Three series give six rows, now distinguishable. (`t5.ts`; qa12/t5-en-390-dark-taskpicker.png, qa12/t5-ru-1440-light-taskpicker.png.)

## Findings

### L1 low — A danger confirmation wraps to 2-3 lines and sits misaligned next to Cancel on a phone
Settings, 390x844, RU and EN, both themes. Tap "Очистить данные" / "Удалить аккаунт" ("Wipe data" / "Delete account").
Happened: Cancel (48 px) and the confirm button share a row and the confirm gets only 205 px, so «Очистить — / подтвердить в / Telegram» takes three lines (EN: "Delete — confirm in / Telegram" two lines, 58 px); Cancel hangs at the top of the row, the heights differ (48 vs 77). Nothing is cut: the round 11 overflow is fixed.
Expected (cosmetic): stack the confirm full-width under Cancel on a phone, or give the confirm more of the row. Screenshots: qa12/t8-ru-390-dark-wipe-confirm.png, qa12/t8-en-390-light-delete-confirm.png.

### L2 low — The phone bar folds only on the main activity: with a parallel activity alone, it is open
Now, 390x844, RU dark, account 7001 (main "Пошёл в ЦСС" + parallel "Музыка"). Load: folded (good). Stop the main one.
Happened: only "Музыка 1 ч 47 м параллельно" remains, the fold row disappears and the field and the four buttons open at once (the list loses the room again); the same happens on a reload with only a parallel activity running. The cause is that the fold is keyed to `running` (the main activity), `alongside` does not count.
Expected: either the same fold for any running activity or no jump; low because the list still has room for about 3 rows. Screenshot: qa12/t12-1.png (script `t12.ts`).

### L3 low — Short activities started within seconds hide each other in the Week grid, and axe flags it
Week, EN (account 7002), 1440 and 390, light/dark. Activities "Getting ready", "Walk", "Reading" and others, each only seconds long, were started and stopped in one minute (as the QA script did).
Happened: all blocks have the 24 px minimum height and sit in the same lane at the same time, so one covers the others ("Walk" is under "Getting ready"); axe reports `target-size` (serious, "partially obscured") for the covered block on `/week` EN in all four combos. Parallel activities with a real overlap (RU lived-in account) are laid out side by side correctly, so only minimum-height blocks collide.
Expected: lay out minimum-height blocks that overlap in columns too. Real data rarely looks like this. Screenshots: qa12/t11-week-1440.png, qa12/sw-en-390-light-_week.png.

## Round 11 findings not touched by this fix pass (seen again or not re-tested)
- M4 (Assistant log shows `parse.activity.start`, "Parsed by fake…" rows with no typed text): unchanged, seen on `/decisions` EN 1440 and 390 (qa12/sw-en-1440-light-_decisions.png). The raw-key scan of the sweep keeps flagging it until it is fixed.
- L11 (every screen titled "Pace"): unchanged on `/`, `/day`, `/settings`, `/week`.
- L4 ("To Inbox" gives no visible feedback): unchanged (no toast at 100/400/900 ms).
- L8 (Insights RU 390: `scrollable-region-focusable`): unchanged.
- Not re-tested: M1 (assistant questions without options), M2 (no repeat/final-deadline line on the task screen), L1, L3, L5-L7, L9, L10, L12-L16; the round's commit touches none of them.

## UX heuristics walk (this round's areas)
Every control earns its place: the fold row is the only way back to the field on a phone and is present exactly while something runs. State you can see: the fold row says "Start something else" in both states and only the chevron changes (round 11 L12, unchanged). Forms keep their promise: every start path (picker, typed, Task picker, replacing start, Focus on the task screen) did what the bar showed. Feedback: the bar no longer jumps under the finger after a start. Copy: M6 lines read the same as the Now rows. Visual matrix: RU x 390 x light/dark checked for the danger buttons, the assistant card, the New task form and the Task picker; 1440 and 768 for the bar. Platform conventions: 1440 never folds, 768 behaves as the phone layout (bottom tabs, folded bar), consistent with `WIDE_MIN_WIDTH = 1024`.

## What works well
- The folded bar on load, after a reload and after navigation, in both languages and themes; the typed text survives fold/unfold; a start made in the bar leaves the bar alone, a start made elsewhere folds it.
- The series dates: Feb 28 / Mar 31 / Apr 30 / May 31 chain after a far deadline, short months clamp, no drift.
- Buttons keep their 48 px look everywhere except where a label really needs two lines; the Russian Telegram confirmations are readable and inside their pill.
- The Task picker is now usable for series; the "Параллельно с текущим" switch and the search field stay in place.
- 160-page sweep clean; no console errors or failed requests anywhere.
