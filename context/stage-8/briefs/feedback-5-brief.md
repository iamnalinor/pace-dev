# Feedback round 5: brief (2026-11-08)

Source: [`context/feedback-5.md`](../../feedback-5.md). Decided with the owner in the session that
finishes PR #54. **All of it ships in PR #54** (owner's choice over "front in #54, the rest in a
separate PR" and "all in a separate PR").

## Decisions

### Presets and recurrence (MCP)
1. `recurrence` takes an optional **first number** for the numbered title (e.g. `firstNumber: 9`
   makes the first instance «ДЗ по алгебре 9»). Numbering rule is written down and shown in the
   tool's description: instance *k* (0-based, in issue order) gets `firstNumber + k`.
   *Open: if the existing generator counts differently (last+1), keep the counting rule it has
   and document it; the default is "first number + index".*
2. Weekdays accept names (`"mon"…"sun"`, case-insensitive, also full English names) as well as the
   numbers already accepted; the tool description says which number is which day.
3. `preset/invalid-definition` names the offending key path and why (the zod issue path and
   message), in the error text the MCP client sees.
4. The tool description says that a preset created with a recurrence whose issue moment of the
   current period already passed issues that period's instance at once.
5. `get_task` returns every field of the task the store knows (`startAt`, `estimate`, …): the
   MCP task row is the full projection, not a subset.

### Front
6. **Every open screen is a link.** The task open in the desktop pane is in the URL
   (`?task=<id>` on the list route), so a reload reopens it; other in-screen state that a person
   would expect to survive a reload (Day's date, Week's week and the picked block, Now's project
   filter, History's period) is in search params too. Back/forward follow it.
7. **Drafts survive a reload.** Text typed into the app's inputs (composer, task fields, subtask
   and inbox inputs, forms in sheets) is saved locally per field and restored after a reload or an
   app restart; it is cleared when the input is submitted or emptied. Local only (device storage),
   never synced, never sent to the server. Secrets (tokens, codes) are never saved.
8. **Links in a task's description are clickable**: a URL in the description opens in a new tab
   (web) / the browser (Android); a tap on the link does not start editing, a tap elsewhere on the
   text still does. Text is not rewritten (user content is never changed).

### Task statuses
9. **No automatic close after the deadline.** No new `cancelled_missed` closure is made; a task
   past its final deadline stays open and reads as overdue. Old automatic closures in the log stay
   as they are (they can be reopened as before).
   Alternative that lost: also reopen the tasks already auto-closed once.
10. **A subtask has one mark, done, with its date and time.** The separate "solved" and "submitted"
    (`sent`) marks become one `done` mark. Old logs: a subtask with either mark reads as done, at
    the earlier of the two times. The «Сдать N» / "Submit N" actions go; marking done records the
    instant (the event's `occurredAt`).
    Alternative that lost: done = the old "submitted" only (solved-only would read as not done).

## Open questions (with the default taken)
- Item 6 on Android: the same params drive the native stack; deep links from outside the app
  (`pace://`) are not added in this round. Default: web URLs only, native keeps its stack.
- Item 7 storage limit: drafts older than 30 days are dropped. Default as stated.
