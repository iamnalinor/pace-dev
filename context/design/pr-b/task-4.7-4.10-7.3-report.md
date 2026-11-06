# Tasks 4.7, 4.10, 7.3 report: Inbox / Decisions, History / Notifications, proposal highlight and logo

## Shipped
- Kit: `Screen` takes a `scroller` (a list that scrolls itself with the screen's column, foot room, scroll edge);
  `SectionedList` (`ui/sectioned-list.tsx`) is the one virtualised grouped list (FlatList, headings over rows drawn
  as `Group` cells, `empty` in place of rows, no `list` role). Inbox, Decisions, History and Notifications use it.
- Inbox (`features/inbox`): header with «n waiting», sections «To sort» (`ReviewRow`) and «Notes» (`CaptureRow`);
  capture text clamps at 4 lines, long ones get «Show all» on `Disclosure`; compact tonal Accept + plain Delete beside
  the row (names «Accept: <text>»), Delete's toast has Undo; row opens the details: the shell inspector on a wide
  window (⌘↵ accepts), the new `inbox-detail` sheet on a phone. Empty state teaches and offers «Open the line».
- Decisions (`features/decisions`): pinned search, day sections, rows on `ListRow`, loading skeleton, failed + Try
  again, «Clear the search» on no match.
- History (`features/history`): `PeriodStepper` in the header's period slot (Today only away), snapshot rows
  read-only with a dot, event rows on `ListRow`; the one visible Undo is the latest undoable event of a task,
  every other undoable row is itself the way in (same confirm sheet).
- Notifications: kit rows grouped by day, kind icon, unread «new» dot kept for the visit, digest 5 tasks + «and N
  more», top-level header on a wide window, empty state with «Set up notifications», failed with Retry.
- 4.7 follow-up (QA21 L7): the rules' preview card words each reason (`assistant.rulesUsed.<reason>`).
- 7.3: `motion.highlight` (600) token; a task created by an approved proposal carries a one-time `accent.quiet`
  wash fading over 600 ms (reduced: shown, then gone); logo SVGs/PNG icons regenerated in the `logo` lime
  (`#C8F03C` dark / `#5E8C00` light), `PaceMark`'s trailing chevron in `label.secondary`.
- Ratchets: `DESIGN_VALUE_WARNINGS` 29, `BARE_PRESSABLE_WARNINGS` 8. Bug-lessons 131, 132.

## Tests added
`inbox-screen.test.tsx`, `inbox-wide.test.tsx`, `history-screen.test.tsx`, `sectioned-list.test.tsx`,
`accepted-highlight.test.tsx`, composer reasons (`it.each`), notifications digest cap and unread dot; existing
Inbox/History/Notifications tests updated to the new names. e2e (not run): `journeys` (Accept by name, Undo exact),
`sheet-focus` opener for `inbox-detail`.

## Deviations
Accept is tonal (spec §5.3), Delete a visible plain button rather than a ⋯ menu; details sheet has no medium
detent; 8 px snapshot dot (6 px has no token). See the plan's "Deferred" notes under 4.7 and 4.10.

## Verify on hardware
Android: long-press/scroll of a 120-capture Inbox (FlatList + nested Disclosure), TalkBack on «Accept: …» names,
the inbox-detail sheet. Web: the inspector's ⌘↵, header scroll edge over FlatList, regenerated icons in the PWA.
