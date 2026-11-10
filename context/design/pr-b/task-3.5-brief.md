### Task 3.5: `Presence` and `Disclosure`

**Files:** Create `ui/presence.tsx`, `ui/disclosure.tsx` (+ tests); Delete `ui/animated-height.tsx`
after its callers move (Now composer form, In future, time-bar unfold, group folds).
**Interfaces:** `<Presence show enter="fade|rise|scale" exit=… onExited>` (keeps children mounted
through the exit; reduced variant = fade); `<Disclosure open onToggle label>` (chevron rotation,
height from measured content, focus moves after layout with `preventScroll`).
- [ ] Failing tests: `show=false` keeps children until `onExited` fires; with reduced motion the
      preset is opacity-only; `Disclosure` sets `accessibilityState.expanded`.
- [ ] e2e geometry sampler (extend `e2e/support/geometry.ts`): during the composer unfold no child's
      box leaves the card (F-MOT-08; bug-lessons 5).
- [ ] Implement; PASS; Commit.

