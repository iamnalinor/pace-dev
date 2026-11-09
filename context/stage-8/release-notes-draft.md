# Release notes — draft (stage 8, PR #54)

What people and connected agents need to know when this build goes out. A draft: the owner
edits the wording before the release.

## Before you use it

- **Update the Android app before giving a preset recurrence a first number.** A preset whose
  recurrence carries `firstNumber` (the numbered title's first number, feedback 5 item 1) is
  dropped by older Android builds: their stricter preset schema refuses it, so the preset and its
  tasks disappear on that phone until it is updated. Accepted by the owner (2026-11-09); update
  every device first, then set the number.

## Changes in behaviour

- **No automatic close after a missed deadline.** A task past its final deadline stays open and
  reads as overdue. Older app builds still try to close it automatically as missed; the server
  now takes such a close from a device and revokes it at once, so the task stays open everywhere,
  that device included after its next sync. Automatic closes already in the history stay as they
  were and can be reopened.
- **Lateness by subtasks only when all are done.** A task closed as done is judged by its latest
  done subtask only when every subtask is done; otherwise by when it was closed. History and
  Insights recount older tasks the same way.
- **A closed task's subtasks are read-only.** Reopen the task to change its marks.

## For MCP clients

- **The `submit` tool is removed.** Mark subtasks done with `mark_subtasks`; a client that cached
  the tool list gets "unknown tool" for `submit` until it lists the tools again.
- `get_task`'s text answer no longer repeats every field in full: long text is cut there, and the
  structured content still carries everything.
