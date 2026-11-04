# Imported from Hentrixz/pace-dev (to review later)

On 2026-11-04 the work of another agent session (fork `Hentrixz/pace-dev`, branch
`claude/vigilant-archimedes-kq5d4w` and its three `wip/*` kit branches) was merged into PR B's branch,
one `--no-ff` merge per source branch, so the original commits keep their hashes and show up as the
second parent of each merge. **Nothing here is reviewed, and `bun lint` / tests were not run after the
merges.** The source state is described in HANDOFF §0.

List them with `git log --no-merges a67cc50..HEAD` or per merge `git log <merge>^2 ^a67cc50`.

| Merge | Source branch | Original commits (all by the other agent) | Status in the source |
|---|---|---|---|
| `340dfd7` | `wip/task-3.9` | `202929a` controls · `99973ba` destructive button, gallery, badge sweep · `4d30e8c` report | green: lint, `test:app` 1101/1101, 4 e2e files |
| `4d72374` | `wip/task-3.7-3.10` | `9c6ac8c` toast, tooltip, offline pill (3.7) · `715a1a8` sidebar, tab bar, avatar (3.10) · `077e60f` bug-lessons, e2e fixes, report | lint and app tests green at `715a1a8`; `077e60f` was `--no-verify` |
| `2f73654` | `wip/task-3.6-3.8` | `aa43cfe` parked minors N1-N4 · `7fd48e7` Sheet/Dialog/Popover (3.6), TextField/TimeInput (3.8), WIP | red: `--no-verify`, TextField complexity, 5 of the raw inputs migrated, no report |
| `42b44a1` | `claude/vigilant-archimedes-kq5d4w` | `2710ec6`, `4329aae`, `779ebee` HANDOFF §0 only | docs |

## Conflicts resolved mechanically (check these first)
- `ui/sheet.tsx`: took 3.6's rewrite whole. The side from main only dropped `variant="plain"` on the
  close `IconButton`; 3.9 renamed Button/IconButton props, so the new `overlay-frame.tsx` may still use
  the old ones.
- `ui/sidebar.tsx`: 3.10's `NavItem`; bell as `place="sidebar"` (3.9's API).
- `shared/notifications/notification-bell.tsx`: 3.9's `IconButton` with `badge`; 3.7's `Tooltip`
  wrapper dropped (`showsOnTap` is gone per 3.7, so `icon-button.tsx` should drop it too).
- `ui/pressable-props.ts`: 3.9's `shape`/`visual` plus the `isDisabled` of the 3.2 minors.
- `scripts/eslint-all.ts`: `DESIGN_VALUE_WARNINGS` = 65 by arithmetic (66 after 3.7, 3.6 says -1);
  the real number comes from `bun lint`.
- `context/bug-lessons.md`: 3.9's class **123** kept; 3.10's "A parent claiming to be the page"
  renumbered **124** (the Log rows were renumbered too; check other references).
- `context/design/redesign-plan.md`: both sets of ratchet notes kept.

## Still open from HANDOFF §0
Rename-prop fallout in `sheet-actions.tsx`, `sync-frame.test.tsx`; tab bar and rail badges onto
`BadgeAnchor`; 3.6/3.8 deferred bullets; then `bun lint`, `test:unit`, `test:app`, e2e.
