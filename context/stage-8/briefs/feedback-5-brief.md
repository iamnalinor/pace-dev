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
   Older clients still write the automatic miss until updated: a client push of one is taken and
   revoked at once by the server (bug-lessons 150), so the task stays open everywhere.
10. **A subtask has one mark, done, with its date and time.** The separate "solved" and "submitted"
    (`sent`) marks become one `done` mark. Old logs: a subtask with either mark reads as done, at
    the earlier of the two times. The «Сдать N» / "Submit N" actions go; marking done records the
    instant (the event's `occurredAt`).
    Alternative that lost: done = the old "submitted" only (solved-only would read as not done).

### Presets, after the round (2026-11-09, owner)
11. **The preset field `submission` (`whole` / `per_subtask`, «Сдача по подзадачам») is removed**
    (the core report's open question). A task's check always closes it (Undo as today);
    subtasks are marked done one by one and show progress. Lateness no longer asks the preset: a
    task with done subtasks is judged by their instants, otherwise by the closing time. The key
    is no longer written, shown or offered (preset editor, task tags, MCP descriptions, base and
    example presets, i18n); old presets, overrides and events that carry it still parse, and
    `parsePresetDefinition` drops it (an optional, deprecated, ignored schema key), so old logs
    and old clients keep working. An old client's whole `task.submitted` is no longer refused
    for want of a done subtask. Numbered problems in quick input are read for `hw` and the
    presets built on it (they were read for `per_subtask` presets). No D1/DO column was involved.
    Alternatives that lost: rename the setting; keep it hidden with `per_subtask` for `hw`
    only (lateness by closing time for every other preset).
12. **Subtasks decide lateness only when every one is done** (owner, 2026-11-09, after the
    session review). A task closed as done whose subtasks are all done is as late as the latest
    done instant (problems done before the deadline and the task closed after it reads on time);
    while any subtask is left open, or with no subtasks, the closing time decides (one of five
    checklist items ticked early and the task closed a week late reads late). Supersedes the
    lateness sentence of item 11. One rule in core (`doneLateness`), read by the outcome and by
    the close sheet's preview. Old logs follow the same rule after deploy (the projection is
    rewritten with the new build).
    Alternatives that lost: any done subtask decides (item 11 as first written: a partly ticked
    checklist hid a late close); subtask instants for `hw`-based presets only.

## Open questions (with the default taken)
- Item 6 on Android: the same params drive the native stack; deep links from outside the app
  (`pace://`) are not added in this round. Default: web URLs only, native keeps its stack.
- Item 7 storage limit: drafts older than 30 days are dropped. Default as stated.

## Decision (2026-11-10): a logged block over another logged block splits it

The owner was asked about R27-05 and chose **always split**. A past activity logged over time that another activity already holds cuts or splits that neighbour «как в календаре» (`context/requirements.md`). This holds whether the neighbour was recorded live or entered by hand. The form says what goes: «Это время уйдёт из «…»».

- **Alternatives that lost:** refusing every overlap (the person moves the neighbour's edge first), and the R26-03 mix (split a live-recorded block, refuse a hand-entered one).
- **Still refused:** editing an existing block so that it overlaps its neighbour is still refused. The rule above covers only a new past activity logged over occupied time.
- **Open question, with a default:** a new block that covers its neighbour completely removes that neighbour (revokes it); the form names it the same way.
