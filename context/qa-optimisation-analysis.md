# QA cost optimisation: what the bug history says is safe

> Copied into the repo on 2026-11-02 as written for round 6-D (cheaper QA rounds), with the QA
> agents' model name left out. The `scratchpad/scripts` it names were throwaway and are not kept;
> what it led to is in [docs/qa.md](../docs/qa.md) (two kinds of round) and
> `e2e/route-sweep.e2e.ts` (the mechanical matrix).

Date 2026-11-02. Read-only analysis of `context/bug-lessons.md` (Log rows found by QA), `context/qa-round-1..20.md`
(medium+ findings of rounds 10–20 in full, rounds 1–9 spot-checked), the git diffs between the builds each round
tested, the dependency graph (`depcruise --output-type json`, current tree), the e2e suite, and the transcripts of
the QA agents of rounds 15–20 (time and token cost).

## 0. Method

**Builds and diffs.** Each qa-round file names the build it tested. Round pairs and their app diffs:

| Round | Build | Diff from previous round's build | App src files changed |
|---|---|---|---:|
| R10 | PR 2 branch ≈ `34aec27` | `0cea8a9..34aec27` (PR 1 → PR 2 checkpoint) | large |
| R11 | `0c52077` | `34aec27..0c52077` | 15 (direct) |
| R12 | `5aa3565` | `0c52077..5aa3565` | 5 |
| R13 | `ea1fddd` | `5aa3565..ea1fddd` | 34 |
| R14 | `6d7b8a1` | `ea1fddd..6d7b8a1` | 48 |
| R15 | `4b6bb43` | `6d7b8a1..4b6bb43` | 135 |
| R16 | `b2d97c2` | `4b6bb43..b2d97c2` | 16 |
| R17 | `4140eb6` | `b2d97c2..4140eb6` | 103 |
| R18 | `9c91fd5` | `4140eb6..9c91fd5` | 69 |
| R19 | `8e84369` (+`4661dd1`) | `9c91fd5..8e84369` | 32 |
| R20 | `09f421d` | `8e84369..09f421d` | 52 |

**Scope B, two readings.** For every round I computed which of the 26 route files (`apps/app/app/**`, layouts excluded)
reach a changed file, on the reverse import graph (`.web.tsx` mapped to its base file, since depcruise resolves the
base; scripts in `scratchpad/scripts/affected.ts`).
- **B-graph** (strict: any transitive importer, including the root layout): **21–24 of 26 routes in every round, R12's
  5-file diff included** (it touched `src/ui/button.tsx`). Every measured diff touched a shared primitive
  (`button.tsx`, `sheet.tsx`, `app-state.tsx`, `_layout.tsx`, `empty-state.tsx`), and a change under the root layout
  reaches every screen. So B-graph has **no counterexamples and no savings**.
- **B-direct** (what a change-scoped brief would realistically cover: routes reaching changed feature/screen files,
  shared primitives `src/ui`, `src/platform`, `app-state`, `runtime`, `_layout` and packages excluded):

| R11 | R12 | R13 | R14 | R15 | R16 | R17 | R18 | R19 | R20 |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 2 | 7 | 7 | 18 | 2 | 11 | 15 | 7 | 8 |

  routes of 26 (lists in §1 notes). "In scope B?" below means B-direct unless it says otherwise.

**How found** (primary category; secondary in brackets): (a) checking a previous round's fix; (b) exploring around a
change; (c) the mechanical matrix (console, requests, raw keys, overflow, axe, landing URL, or a width/theme/language
combination); (d) every form from every entry path; (e) the UX-heuristics walk; (f) an owner scenario
(`context/feedback-*.md`); (g) a screen far from anything changed. Two categories added because the data needs them:
(h) the keyboard/focus pass (Tab, Enter, Escape, focus after a swap) and (s) the states pass (offline, server down,
first sync).

**Automatable by A?** "yes" = a generic per-route check (console/pageerror, failed or 4xx/5xx requests, raw keys,
element-level text clipping, axe, landing URL, a request-quiet window) would flag it; "guarded" = a test now pins it
(file named); "no" = needs judgement or a specific flow.

## 1. Per-finding table: every medium+ finding of rounds 10–20 (45: 4 high, 41 medium)

| R | Id | Sev | Screen (combo where it matters) | How found | In scope B? | Automatable by A? |
|---|---|---|---|---|---|---|
| 10 | H1 | high | Now, time bar («ем» → Other) | f (b) | yes (PR 2 changed Now, time bar) | no |
| 10 | M1 | med | Now composer (title cut at 90) | f | yes | no |
| 10 | M2 | med | Settings switches (no focus ring, 20 px) | h (c) | yes (Settings in PR 2 diff) | yes: axe `target-size` + focus-ring probe |
| 10 | M3 | med | Now, assistant card shows too little | b (f) | yes | no |
| 10 | M4 | med | Now **390 only**, two running: bar eats half | c-width (f) | yes | no (layout judgement) |
| 10 | M5 | med | Settings, destructive confirm in lime | e (colour) | yes | no |
| 10 | M6 | med | Login, bot wait dead end | d (e) | yes | no |
| 11 | H1 | high | Now **390 only**, folded bar never folds on load | a (R10 M4 fix) (c-width) | yes | no (class 8; app test mounted with store loaded) |
| 11 | M1 | med | Now card, questions without options | b | yes | no |
| 11 | M2 | med | Task screen/rows: repeat invisible | e "state you can see" (b) | yes | no |
| 11 | M3 | med | New task, monthly series far deadline | b | yes | no |
| 11 | M4 | med | `/decisions`: raw rule keys, provider name | b → g (downstream of the assistant change) | **no**: decisions untouched; the dependency is data (events), not imports | no (not i18n keys) |
| 11 | M5 | med | Settings **RU + 390 only**: confirm label spills | a (R10 M5 fix) (c-combo) | yes | **yes**: element clipping check (R12 verified it that way); not guarded per route |
| 11 | M6 | med | Time bar Task picker, series instances | d | yes | no |
| 13 | H1 | high | Task → Edit, repeat again after stop | b | yes | no |
| 13 | M1 | med | `/decisions`, correction thread "created twice" | b | yes | no |
| 13 | M2 | med | Composer: `/api/parse` sent twice | b (network log) | yes | yes (duplicate-request window); guarded `composer.e2e.ts` |
| 13 | M3 | med | `/decisions`, approved edit "shown for approval" | b | yes | no |
| 13 | M4 | med | Time bar `#ask` | d | yes | no |
| 14 | M1 | med | Edit card does not say the new value | d (b) | yes | no |
| 14 | M2 | med | Card Cancel + toast Undo, **RU only** «Отменить» twice | e copy (c-lang) | yes | no |
| 14 | M3 | med | `/decisions`, thread shows last turn only | b | yes | no |
| 15 | H1 | high | `/notifications`: ~70 req/s loop, bell never clears | b (network log) | yes | **yes** (request-quiet window); guarded `notifications.e2e.ts` (one screen) |
| 15 | M1 | med | Settings, end an already-ended session | b | yes | no |
| 15 | M2 | med | Add a computer: Enter does nothing | h | yes | no; guarded `sessions.e2e.ts` |
| 15 | M3 | med | Settings **390 only**: confirm order | c-width (e) | yes | no (convention); guarded `sessions.e2e.ts` |
| 15 | M4 | med | Settings, focus lost after revoke | h | yes | no; guarded |
| 16 | M1 | med | Feed "Not me" drops focus | a (R15 L11 change) (h) | yes | no; guarded `notifications.e2e.ts` |
| 17 | M1 | med | Second tab of one profile stale | b (brief: "a second tab") | yes | no; guarded `live.e2e.ts` |
| 17 | M2 | med | `/day`, `/inbox` by URL rewrite to `/` | c (sweep landing URL) | partial (Day yes, Inbox no; B-graph yes) | **already guarded** `route-sweep.e2e.ts` `expectedLanding` |
| 17 | M3 | med | `/add` PWA share target drops text | d (f feedback-4) | yes, weakly (composer reached; the share path itself never changed) | no; guarded `composer.e2e.ts` |
| 17 | M4 | med | Every data screen on a cold first sync, RU account | b (re-pull) (f skeletons) | yes (client sync changed) | partly (route sweep with a held pull); guarded per route `sync-state.e2e.ts` |
| 17 | M5 | med | Offline: nothing says so | s (f) | yes (Now) | no; guarded `sync-state.e2e.ts` |
| 17 | M6 | med | Sidebar **1440 only**: name cut to "D…" (since R10 L8) | c (sweep screenshots) (f feedback-4) | **no**: `sidebar.tsx` untouched in R17 (B-graph yes via `_layout`) | **yes**: element clipping; guarded `smoke.e2e.ts` (this element only) |
| 17 | M7 | med | Icon-only buttons, **1440 only**, no tooltip | e (f) | partial (task screen yes; Day, Week no) | yes (structural); guarded `tooltips.e2e.ts` (every route) |
| 18 | M1 | med | Edit task + pickers open focused on the dim | h | yes (task header, time bar changed; `Sheet` untouched) | yes (open each sheet, assert focus); guarded `sheet-focus.e2e.ts` |
| 18 | M2 | med | Composer: Enter on empty line types `\n` | h (d) | yes | no; app test |
| 18 | M3 | med | Day sheet: end before start, three answers | a (R17 L14 fix) | yes | no |
| 18 | M4 | med | Server down while idle: no offline line | a (R17 M5 fix) (s) | yes | no; guarded `sync-state.e2e.ts` |
| 18 | M5 | med | First-sync cover; EN empty copy for RU account | a (R17 M4 fix) (c-lang) | yes | partly; guarded |
| 19 | M1 | med | Day **and `/decisions`** print zeros during first sync | a (R18 M5 fix, swept over all routes) | partial (Day yes, `/decisions` **no**; it does not import `empty-state.tsx`, the file the fix changed) | yes (generic held-pull route sweep); guarded for `/day`, `/decisions` only |
| 19 | M2 | med | Done's other times only by an untold long press | e "every control earns its place" (f) | screen yes (Now's task pane), **flow no** (Done/close untouched in R19) | no; guarded `tooltips.e2e.ts` |
| 20 | M1 | med | **Settings** and Presets draw defaults, live switches overwrite the account | a (R19 M1 fix, swept over all routes) | partial (Presets yes, **Settings no**; B-graph yes via `sheet.tsx`) | yes (same held-pull sweep); guarded for these two |
| 20 | M2 | med | Close sheet: Cancelled/Skipped drops focus | a (R19 M2 fix) (h) | yes | no |
| 20 | M3 | med | Share into the same page wipes the half-typed line | a (R19 L4 fix) | yes | no; guarded `composer.e2e.ts` |

R12 (verification round) had no medium+ (3 lows: Settings danger confirm wrap, phone bar with a parallel activity, axe on
Week). Rounds 1–9 were spot-checked: 62 medium+ in R1–R6, nearly all on screens a stage had just rebuilt; the matrix-type
ones were R3-2 (phone Day header, width), R3-5 (22 px target, axe-catchable), R3-7 (Week on a phone, width) and R6-4
(signed-out deep links, now guarded by the signed-out route sweep). R7 (160 loads × matrix) found nothing new; R8, R9
were fix re-checks.

### Low findings logged in bug-lessons (QA-sourced), compact

| R | Ids (how found → B-direct) |
|---|---|
| 13 | L7 b→yes; L10 b→yes |
| 14 | L1/L2 b→yes; L3 b→yes; L4 b→yes; L5 e→yes; L6 d→yes; L7 b→yes; L8 h→yes; L9 b→yes |
| 11/14/15 | Insights RU 390 `scrollable-region-focusable` (axe, c-combo) → **no** in R11, R14, R15 (Insights untouched) |
| 15 | L2 b→yes; L11 b→yes |
| 16 | L1 b→yes; L2 h→yes; L6 e→yes |
| 17 | L1 b→yes; L2 c-390→yes; L3 e (carried since R10 L7)→screen yes, flow no; L4 d→yes; L5 e→yes; L6 h→yes; L7 e→yes; **L8 axe Week→no**; L9 e/theme→yes; L10 e→yes; L11 g→yes; L12 c RU+390→yes; L13 c-lang→yes; L14 b→yes; **L15 e Week→no**; **L16 b `/decisions`→no** |
| 18 | L1 h→yes; L2 a→yes; L3 b→yes; L9 h→yes; L12 e→yes |
| 19 | L1 a/h→yes; L2 a, dark only→yes; L3 e→yes; L4 a→yes; L6 e (carried)→screen yes, flow no; **L7 e Presets→no** |
| 20 | **L1 a/h touch, Settings→no**; L2 a→yes; L3 a→yes; L4 b→yes; L5/L8 b→yes; L6/L7 b/h→yes; L9 c-network→yes |

Code-review rows of the same period (R17 review I1–I3, m1–m11, round-3 C1, round-4 R1–R4, fix round 5 V1–V7) are a
different population: races, state machines, one-shots, cut connections. QA found none of those; the parallel review is
not replaceable by QA or vice versa.

## 2. Counts

**Medium+ (45) by how found (primary):**

| a fix check | b around change | c matrix/combo | d entry paths | e heuristics | f owner | g far | h keyboard | s states |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 14 | 4 | 4 | 5 | 2 | 0 | 5 | 1 |

- (a)+(b) = 24 (53 %), including 3 of the 4 highs. In R18–R20, 7 of 10 mediums came from checking the previous round's
  fixes; the rounds converge by verifying fixes and sweeping their class.
- Counting secondary tags: a width/language combination mattered in 9 (width only 5: R10 M4, R11 H1, R15 M3,
  R17 M6, R17 M7; language 3: R14 M2, R17 M4, R18 M5; RU+390 1: R11 M5); the owner's feedback documents in 10; the
  keyboard/focus pass in 7.
- (g) never appears as the primary path: the far-screen findings (R11 M4, R17 M6) were reached by following a change
  downstream or by the screenshot matrix.

**By severity:** blocker 0, high 4 (R10 H1, R11 H1, R13 H1, R15 H1), medium 41. Logged lows ≈ 60.

**What the programmatic matrix itself found in R10–R20** (console, failed requests, raw keys, page overflow, axe over
every route × 2 widths × 2 themes × 2 languages, 128–176 loads a round): 1 medium (R17 M2 landing URL, now in the route
sweep) and 4 lows (axe: R11 L8 Insights RU 390, R12 L3 Week, R17 L8 Week, the R15 L14 carry). **R18, R19, R20: 0
console errors, 0 failed requests, 0 raw keys, 0 page overflow, 0 axe violations** on 176/176/156 loads. Raw keys: 0 in
every logged round (the i18n catalogs are checked statically, `packages/core/src/i18n/i18n.test.ts`).

**Combos that produced a medium+ finding only in that combo:**

| Dimension | Only-in-this-value medium+ findings |
|---|---|
| 390 px | R10 M4, R11 H1, R15 M3, R11 M5 (with RU) |
| 1440 px | R17 M6 (sidebar), R17 M7 (hover tooltips) |
| Russian | R14 M2, R11 M5 (with 390); account-language mismatch: R17 M4, R18 M5 (RU account in an EN browser) |
| English | none |
| Dark | none (dark-only findings in 20 rounds are all low: R5 QA5-13 and R6 QA6-9 contrast, R10 L10 toggle, R19 L2 skeleton) |
| Light | none |

**Heuristics walk.** Medium+ from it: R10 M5, R11 M2, R14 M2, R17 M7, R19 M2, plus the keyboard line of the walk
(R15 M2 "Enter submits", R18 M2). All were on screens in B-direct scope except R17 M7 (partly: Day, Week) and R19 M2
(screen in scope, flow untouched). The walk produced 0 medium in the verification rounds (R12, R16).

**Cost of a round** (QA agent transcripts R15–R20, `scratchpad/scripts/cost2.py`): 21–48 min of agent time, 90k–240k
output tokens, 12–72 M cache-read tokens. Turns that build or run the matrix (sweep, axe, montage) took 2.5–12.8 min
(avg ≈ 6 min, 7–39 %, avg ≈ 18 %) and 10–17 % of output tokens (avg ≈ 14 %). The rest is interactive exploration.
These are regex attributions over the transcripts, so treat them as ±5 points.

## 3. Counterexamples per optimisation (findings it would have missed)

**A. Matrix into e2e, QA stops redoing it.** Missed only if QA also stops *looking*: R10 M4 (390 bar takes half of Now),
R15 M3 (phone confirm order) and R14 M2 (RU word collision) are visual or copy judgement, not generic checks. R11 M5 and
R17 M6 are clipping, which a generic element-clipping check catches; neither is in the route sweep today (`smoke.e2e.ts`
pins the sidebar name only). With the visual line kept ("look at each changed screen at 390 and 1440 in Russian"), A has
**no medium+ counterexample**.

**B-graph (import graph).** None, and no savings: 21–24 of 26 routes every round.

**B-direct (change-scoped by feature files).**
- R11 M4 medium: `/decisions` untouched; it shows what the changed assistant wrote (a data dependency, invisible to imports).
- R17 M6 medium: sidebar untouched; found in the screenshot matrix (a carry since R10 L8, upgraded against feedback 4).
- R20 M1 medium: Settings untouched; found because the R19 first-sync fix was swept over every route. Live switches
  could write the defaults over the account's settings.
- Partial: R19 M1 medium (`/decisions` half), R17 M7 medium (Day/Week icons), R17 M2 medium (`/inbox`; already guarded).
- Flow-level miss: R19 M2 medium (Done's long press; Now in scope, the Done/close flow untouched).
- Lows: Insights axe RU 390 (R11, R14, R15), R17 L8, L15, L16, R19 L7, R20 L1.

**C1. Drop the theme dimension from manual exploration.** No medium+ counterexample in 20 rounds. Lows: contrast in dark
(axe catches it if axe runs in dark) and R19 L2 (an animated skeleton at 1.1:1, which axe at rest cannot see; it was found
while checking the first-sync fix on a changed screen).

**C2. Drop a width.** Unsafe: 4 phone-only and 2 desktop-only medium+, including the high R11 H1.

**C3. Drop English.** No EN-only medium+. But a fresh EN account found the empty-state and language-mismatch
findings (R17 M4, R18 M5), so the specific cases have to stay.

**C4. Drop Russian.** Unsafe: R14 M2, R11 M5, and the mismatch pair.

**C5. Drop the heuristics walk in intermediate rounds.** Unsafe: 5 medium+ (e) and the keyboard line (R15 M2, R18 M2).
**Shrink it to changed screens + an always-on set:** no full medium+ counterexample (R17 M7 partial).

**C6. Code review alone for server-only changes.** R15 H1 (high): a server rule ("a session does not read its own notice")
made the client re-mark it ~70 times a second. Only QA's network log caught it, and the fix's re-review read the server
diff only (bug-lessons class 1). R17 M1 (medium) is the same shape ("do not tell the writer" assumed one writer per
device id).

**C7. Skip fix verification or the exploration around a change.** Unsafe: 24 of 45 medium+, including 3 of 4 highs.

## 4. Recommendations

### Safe: apply (the evidence shows no medium+ loss)

1. **A, narrow form: the programmatic matrix leaves the QA prompt and joins `e2e/route-sweep.e2e.ts`.**
   - e2e: extend the per-route loop with (i) both themes (`localStorage["pace.theme"]`) and `expectNoA11yViolations`
     on each load; (ii) the lived-in RU account plus a fresh EN account; (iii) failed and 4xx/5xx responses (allow the
     signed-out 401s); (iv) a text-clipping probe: every visible text node or button label whose `scrollWidth >
     clientWidth` or whose box leaves its pressable parent (R11 M5, R17 M6, R10's "Переключени/й"); (v) a request-quiet
     window: after the screen settles, no request repeats for the same URL within ~3 s (R15 H1, R13 M2, R20 L9). That
     is 26 routes × 2 × 2 × 2 ≈ 210 loads. Run axe in one language per theme to keep it near +4–6 min of e2e, or put
     it in its own Playwright project or shard.
   - docs/qa.md prompt: replace "console errors and failed requests on every screen; translation gaps and raw keys;
     text overflow, contrast" with "the route sweep (`bun test:e2e route-sweep`) covers console, requests, raw keys,
     clipping and axe on every route × width × theme × language: do not script your own; look at the screens with your
     eyes". **Keep** the "Visual matrix" heuristic: each *changed* screen at 390 and 1440 in Russian (R10 M4, R15 M3,
     R14 M2 need eyes).
   - Saves ≈ 6 min and ≈ 14 % of output tokens a round (measured R15–R20). Evidence: the last three matrices found
     nothing on 508 loads; in R10–R20 the matrix found one medium, already in e2e.

2. **One theme for manual exploration.** docs/qa.md: "explore in light; screenshot each changed screen in dark once; axe
   in dark is in the route sweep". Evidence: no medium+ theme-only finding in 20 rounds. Saves an estimated 2–4 min a
   round (the screenshot passes double with the theme); no timing for this alone.

3. **Russian as the main language; English only where it has caught things.** docs/qa.md: "explore with the lived-in RU
   account; use a fresh EN account for empty and first-run states, and a RU account in an EN browser for first sync".
   Evidence: no EN-only medium+; the EN cases that mattered (R17 M4, R18 M5) are the two named ones. Estimated 3–5 min.

4. **Known-open list in the brief.** The QA prompt lists last round's open lows with "confirm in one line, re-judge the
   severity against the owner's feedback, do not re-investigate". Evidence: carries cost re-investigation every round:
   R10 L8 → R11 → R17 M6; R10 L7 → R11 L6 → R17 L3 → R19 L6; Insights mid-word R10 → R11 L8 → R17 L12; offline R10 L9
   → R11 L5 → R17 M5; page titles R11 L11 → R15 L14 → R17 L11 → R18 L8; the "Done" toast R10 L11 → R11 L3 → R14 L10.
   They are still checked, so nothing is lost. Saves an estimated 2–3 min.

5. **Do not build B on the import graph.** dependency-cruiser can list dependents (`--reaches`, `--affected`), but on
   this codebase every fix wave touches a primitive under the root layout, so it returns 21–24 of 26 routes. It also
   cannot see data dependencies (assistant → `/decisions`, server rule → client loop) or the `.web.tsx` swap. Not worth
   a script.

### Conditional: safe if X

6. **Change-scoped intermediate rounds (B-direct), safe if all of these hold:**
   - (i) a full round still runs before every release;
   - (ii) the scope is the fix list plus the changed feature folders plus an **always-on set**: Now with the task pane,
     Settings, the shell (sidebar, bell, toasts), login;
   - (iii) **downstream readers** of changed data are added by rule: assistant/parse → `/decisions` and History; client
     sync/store → every data route in first-sync and offline states;
   - (iv) a fix to an app-wide rule (first sync, focus on swap, Escape, tooltips) is swept over every route or sheet,
     preferably by a generic e2e (item 9), not by hand.

   Without (ii)–(iv) it misses R11 M4, R17 M6, R20 M1 (all medium; R20 M1 can overwrite account settings). docs/qa.md:
   a "Scope" section with the always-on set and the downstream table; the brief template's "what changed" list
   generated from `git diff --stat` by feature folder. Saves an estimated 20–35 % of an intermediate round (≈ 8–15 min)
   by skipping untouched Week, Insights, History, Projects, Presets, Inbox, onboarding/permissions and their forms.

7. **Heuristics walk only over changed screens + the always-on set in intermediate rounds; full walk at release.**
   Safe if the always-on set includes Now's task pane (R19 M2 was found there with its flow untouched). No full medium+
   counterexample; R17 M7 was partial and is now guarded on every route. Saves an estimated 5–8 min.

8. **No intermediate QA round for a server-only diff**, safe if the request-quiet window (item 1 (v)) runs on every route
   and the review brief carries "trace the client side". Without them, R15 H1 (high) is the counterexample. Saves a
   whole round (≈ 35–50 min) when it applies, which is rare: most waves touch the app.

9. **Turn per-instance e2e guards into class sweeps over `routeFiles()`.** This is what makes items 6 and 8 safe.
   `sync-state.e2e.ts` lists routes by hand (`["/day", "/decisions"]`, then Settings and Presets in a separate test).
   That is exactly how R18 M5 → R19 M1 → R20 M1 recurred: each fix covered the routes the last round named. Make it
   one loop: every route under a held first pull shows no empty sentence, no zero total, no default drawn as the
   account's value, and writes nothing. Do the same for sheet focus (`sheet-focus.e2e.ts` keeps a hand list of
   openers). Cost: e2e minutes, not QA minutes.

### Unsafe: keep as is

10. **Both widths, 390 and 1440, in manual exploration.** Phone-only R10 M4, R11 H1 (high), R15 M3, R11 M5;
    desktop-only R17 M6, R17 M7.
11. **Russian everywhere it is explored**: R14 M2, R11 M5, and the account-language mismatch pair.
12. **Fix verification and "look hard around each change"**: 24 of 45 medium+, 3 of 4 highs; in R18–R20, 7 of 10
    mediums.
13. **The keyboard/focus pass and the heuristics walk on what changed**: 10 medium+ ((e) 5, (h) 5).
14. **Every form from every entry path, for the forms that changed**: R10 M6, R11 M6, R13 M4, R17 M3, R14 M1, plus the
    lows R14 L6 and R17 L4.
15. **The parallel code review**: it finds a disjoint population (races, one-shots, cut connections) that QA never
    reported.
16. **The owner-feedback re-read**: it drove or backed 10 medium+ and upgraded carried lows (R17 M6, R17 M5) to the
    severity the owner gives them.

**Net estimate per intermediate round** if 1–4 and 6–7 are applied: ≈ 20–30 min of a 35–50 min round (≈ 50 %), for
≈ +5 min of e2e per CI run. Release rounds: ≈ 10–15 min (items 1–4 only).

## 5. Caveats

- B-direct used the *current* import graph for old diffs (files that no longer exist were dropped); the module layout
  was stable enough for a route-level answer, but a few early files (e.g. the removed `/devices` route) were not
  counted.
- R10's base build is not recorded; `34aec27` (the last commit before the R10 report) is an approximation.
- Classification is mine, from the report texts and the briefs in the QA transcripts (each brief lists "what changed,
  check each fix and look hard around them", which is how (a) and (b) were told apart).
- Time and token shares come from regex attribution over six QA agent transcripts. Some rounds were resumed in more than
  one agent (R16 has three), so absolute minutes are lower bounds.
