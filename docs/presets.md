# Presets

A preset is the profile of a kind of task: which urgency policy ranks it, which deadline
rule applies (hard, or resubmission with a final date), whether it is submitted as a
whole or per subtask, how progress is tracked, whether it recurs (homework every
Thursday), which extra fields it shows and when notifications fire.

Presets are **data, not code**. They live in the event log as `preset.created`,
`preset.updated` and `preset.archived` events (already part of the event schema,
`packages/core/src/events/payloads.ts`), so they sync to every device like tasks do and
other people can run Pace without editing the source.

Planned for stage 1:

- Five built-in, non-editable **base presets** in core (`hw`, `work`, `personal`,
  `deferred`, `inbox`).
- User presets **extend** a base preset or another user preset and store only what they
  change; a task can override single fields on top.
- The editor is in the web app (Settings → Presets) with validation and a live preview;
  the Android app and the MCP tools only read presets.
- A one-click seed of example course presets on first login.

This page will document the fields, inheritance and the editor once they exist.
