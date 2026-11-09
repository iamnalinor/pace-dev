# Release notes — draft (stage 8, PR #54)

What people and connected agents need to know when this build goes out. A draft: the owner
edits the wording before the release.

## Before you use it

- **Update every device before giving a preset recurrence a first number.** A preset whose
  recurrence carries `firstNumber` (the numbered title's first number, feedback 5 item 1) is
  refused by the previous release's stricter preset schema, and an older app drops the whole
  preset event that carries it: if the number was set when the preset was created, the preset is
  missing on that device (and its tasks show without it); if it was set by an update, that whole
  update (name, recurrence, deadline policy, everything changed with it) is lost on that device,
  which keeps the older definition. Nothing else this build writes into a preset is refused (pinned
  by `old-reader-compat.test.ts`). Accepted by the owner (2026-11-09): update the APK and every
  web tab first, then set the number.

## Changes in behaviour

- **No automatic close after a missed deadline.** A task past its final deadline stays open and
  reads as overdue. Older app builds still try to close it automatically as missed; the server
  now takes such a close from a device and revokes it at once, so the task stays open everywhere,
  that device included after its next sync. Automatic closes already in the history stay as they
  were and can be reopened. Two edges on an older build: a missed close it confirmed while offline is undone
  when it syncs (the task reopens), and an instance it made ahead when it closed the task stays
  (it is the same instance this build would make, so nothing is doubled).
- **Lateness by subtasks only when all are done.** A task closed as done is judged by its latest
  done subtask only when every subtask is done; otherwise by when it was closed. History and
  Insights recount older tasks the same way.
- **A closed task's subtasks are read-only.** Reopen the task to change its marks.

## For MCP clients

- **The `submit` tool is removed.** Mark subtasks done with `mark_subtasks`; a client that cached
  the tool list gets "unknown tool" for `submit` until it lists the tools again.
- `get_task`'s text answer no longer repeats every field in full: long text is cut there, and the
  structured content still carries everything.
