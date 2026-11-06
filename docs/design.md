# Designing a new feature

Every new screen, flow, component or visual change goes through this page, so new work looks
as if it had always been part of Pace. It is the working method of the 2026-11 design overhaul
written down for everyone after it (agents included). The rules here are binding; the tools are
the ones to reach for first, and when a session lacks one, do the same step by hand.

## What to read first

| Source | What it settles |
|---|---|
| [PRODUCT.md](../PRODUCT.md) | Who the user is (the owner first), the platform (adaptive: Android + phone web + desktop web), the information architecture, principles, terminology |
| [DESIGN.md](../DESIGN.md) and `.impeccable/design.json` | The visual system, direction **A · Тетрадь** (ink-blue accent, red margin for status only, paper grounds, Inter) |
| `packages/core/src/design/tokens.json` | Every colour, size, space, radius, type role, duration and easing. Nothing else is a design value |
| [context/design/redesign-spec.md](../context/design/redesign-spec.md) | Component specs (§4: states, sizes, a11y per component), screens (§5), motion (§6), web/PWA (§7), accessibility (§8), the owner's answers (§12) |
| [context/bug-lessons.md](../context/bug-lessons.md) | The classes of mistakes already made. New UI is written against them, especially 10, 11, 21, 22, 27, 108–113 |
| `context/feedback-*.md` | What the owner asked for, in his words: the scenarios every design is walked through |

While the overhaul is still landing (see the plan, `context/design/redesign-plan.md`), DESIGN.md
and spec §4 describe the target: build new UI to the target with the kit in `apps/app/src/ui`,
not to whatever an older screen still shows.

## The method, step by step

1. **Understand the job.** `superpowers:brainstorming` before anything larger than a tweak;
   `ux-superpowers` `jobs-to-be-done` and `user-journey` over the owner's scenarios
   (`context/feedback-*.md`, PRODUCT.md "Operating Context"): phone one-handed in motion, desktop
   beside course chats with the keyboard. Write down which job the screen does and the
   three-tap path.
2. **Shape it.** The `impeccable` skill (Operate mode: product UI, calm, dense where it helps)
   with DESIGN.md as the contract. For anything new on screen, draw a comp first:
   an HTML comp in `context/design/comps/`; when the owner has to choose, publish one demo per
   option as artifacts, give the options with a default, and ask. Never ship an unshown
   direction change.
3. **Spec it like §4.** Before code: the component's states (default, pressed, focused,
   selected, disabled, loading, error, empty), its sizes from tokens, its roles in both themes,
   its RU text (15–40 % longer), its keyboard and screen-reader behaviour, haptics (§3.10) and
   motion (§6). Add or amend the spec entry so the next change can't silently revert it.
4. **Build only from tokens and the kit.**
   - Colours, spacing, radii, type, durations, easings: generated classes and accessors only
     (`bun design:generate` after a token change). `pace/no-raw-design-values` and its exact
     ratchet (`DESIGN_VALUE_WARNINGS`) fail anything else; never raise the number.
   - Choose a role **by its job, never by the old name** (class 112): a selected state is a cue
     (≥ 3:1 against unselected), meta text is `label.secondary`, quiet priority is a
     `label.secondary` title, red is status only.
   - Kit components from `apps/app/src/ui` (Button, IconButton, Chip, Switch, Sheet, ListRow…);
     a new primitive goes into the kit with its gallery entry, not into a screen.
   - Every string through `t()` (EN source, RU mirror); numbers, durations and initials through
     core's formatters (class 110, 111), never `toFixed` or `slice(0, 1)`.
   - One UI for Android and the web; web-only code in a `.web.tsx` sibling.
   - Targets 48 dp (Android) / 44 px (web), with negative-margin offsets chosen with both sizes
     (class 11). Keyboard complete on desktop: Enter submits, Escape closes, Space toggles
     switches, chips, checks and tabs (`spacePress`, disabled controls get no action, class 113),
     visible focus ring in the `focus` role. Shortcuts are Alt+N / Alt+F (⌥ on a Mac), never a
     single key.
   - A JS number that repeats a class's size moves with the class (class 11, mirrors), better:
     derive it from the token.
5. **Measure contrast as data.** Every new colour pair, including state cues and layered tints
   (a tag on a selected row), goes into `packages/core/src/design/pairs.ts`: text at its tier
   (body, meta with |Lc| ≥ 60, small), marks and cues at 3:1, both themes, over every ground it
   sits on. A pair that isn't listed isn't checked.
6. **Instant and calm.** The visible result of a tap comes from in-memory state in the first
   frame; the write follows and a refused write rolls back with a sentence (class 108). Never
   `await` on a tap's visual path; never drop an action's answer (`useRunAction`). Budget:
   tap → next frame ≤ 100 ms (p75) at 4× CPU, `e2e/latency.e2e.ts`. Motion from the motion
   tokens, reduced motion honoured; a structural change animates, a list mount doesn't.
7. **Try to break it.** Add the screen or component to the worst-case gallery
   (`apps/app/app/dev/gallery.tsx`, `@pace/core/testing` worst-case data) and run the
   `dev-core:break-ui` method: long RU names, unbreakable strings, emoji, zero and huge counts,
   missing fields. `e2e/worst-case.e2e.ts` must stay green.
8. **Look at it in every combination.** Shoot the matrix
   (`DESIGN_SHOTS=.cache/shots/<name> bun test:e2e e2e/design-shots.e2e.ts`, narrow with
   `DESIGN_SHOTS_ONLY` / `DESIGN_SHOTS_STATES`; build with `EXPO_PUBLIC_API_URL` and
   `EXPO_PUBLIC_DEV_LOGIN=1` as `playwright.config.ts` does): phone 390 and desktop 1440,
   light and dark, EN and RU. Then review the shots with `dev-core:apple-design` and the Design
   plugin's `design-critique`, `accessibility-review` and `ux-copy`; finish with `impeccable`
   polish or the `dev-core:impeccable-finish-reviewer` agent against DESIGN.md and the comp.
   Fix and re-shoot until only cosmetic findings are left.
9. **Prove it.** TDD at the right level (`docs/testing.md`), jest-expo tests by role and
   `accessibilityState` for each state the spec names, `bun lint`, the **full** `bun test:e2e`
   (not a subset), an exploratory QA round (`docs/qa.md`), and a review through
   `superpowers:requesting-code-review`. Android-only behaviour (ripple, insets, haptics,
   touches outside a parent's bounds) goes on the verify-on-hardware list in the PR.

## Before a UI pull request

- [ ] Comp or demo shown to the owner for anything new on screen; spec §4/§5 entry added or amended
- [ ] No raw design values; lint ratchet unchanged or lower; roles chosen by job
- [ ] New colour pairs (text, cues, layered tints) in `pairs.ts`, both themes, every ground
- [ ] Every state the spec names exists and is tested; keyboard, focus ring, Space, targets
- [ ] RU and EN, phone and desktop, light and dark shot and looked at; worst-case gallery entry
- [ ] Taps instant (no await on the visual path), refusals answered with a sentence
- [ ] `bun lint`, unit, app and the full e2e suite green; QA round; code review; bug-lessons entry
      for every bug found on the way, with its sweep and guard
- [ ] Before/after screenshots and the verify-on-hardware list in the PR description

## Decisions already taken (don't reopen without the owner)

Direction A · Тетрадь; logo in the lime accent (`#5E8C00` light, `#C8F03C` dark); check-off is a
plain 160 ms fade; Normal priority shows nothing, Low (Необязательно) is a `label.secondary`
title, Important/ASAP keep their marks; no Pause in the header; delete is an inline confirm with
Undo in the row; Alt+N / Alt+F shortcuts; haptics on; tablet gets the rail and rotation; no
Material You (our colours on Android too); the time bar's tiles stay visible and only the field
folds. Sources: spec §12, `context/design/findings.md`.

2026-11-06 (owner): Now's task list is one plain list — tasks with a deadline, one edge-to-edge hairline (a labelled `separator` for screen readers), then tasks without one; no group headers, no preview or «Show all». «In future» stays a fold.

2026-11-06 (owner): Settings sessions show the real device. The server parses the stored User-Agent (`userAgentDetails`: browser + major version, OS + version where the UA carries it, Android model, form factor; unknown parts absent) and the phone app sends brand, model and Android version at login (`expo-device`; optional fields, D1 migration `0009`, old rows null). `GET /api/sessions` returns `device`, with `name` kept for old clients. The row title is the device ("Samsung Galaxy S23", "Chrome 131 on macOS"), the parts the title does not say go under it, and old rows fall back to their name. Left: no tablet icon in the kit (a phone browser gets the smartphone icon), no PWA/standalone detection (the UA does not differ), UA reduction hides macOS/Android model on some Chromes.
