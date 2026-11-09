# Feedback round 5, front items 6–8: report (2026-11-08)

Brief: [`feedback-5-brief.md`](feedback-5-brief.md), items 6, 7 and 8. Branch `fb5-front`, from
the PR #54 tip.

## 6. Every open screen is a link

One hook, `useSearchParam(name)` (`apps/app/src/shared/use-search-param.ts`), reads one search
param of the screen's own address (`useLocalSearchParams`) and writes it with
`router.setParams` (`null` takes it off). `useZonedDateParam` keeps a day as its calendar date in
the account's zone and reads it back as noon there (an instant inside that day in any zone).
Every screen validates what it reads and falls back to its default **without writing anything
back**: an unknown id, a malformed or impossible date, a moment not yet come. So the address never
starts a loop (bug-lessons 1); each screen's tests assert `router.setParams` was never called for
a bad param.

| Screen | Param | Value | Fallback |
|---|---|---|---|
| Now (wide), the task beside the list | `task` | task id | an id the store does not hold (deleted, mistyped, the log still loading): pane closed, the address left as it is; it opens once the task is known |
| Now, the project filter | `project` | project id | a project with nothing open: All |
| Day | `date` | `yyyy-MM-dd` in the account zone | today |
| Week | `week` | `yyyy-MM-dd` (any day of the week; written as the day navigated to) | this week |
| Week, the picked tracked block | `block` | block (activity) id | a block the week does not hold: nothing picked |
| Insights | `week` | `yyyy-MM-dd` | this week |
| History | `at` | ISO instant (UTC) | now (also for a moment not yet come) |
| Inbox, the open capture or decision | `open` | `<capture id>` or `review:<task id>` | nothing open |

Already links before: `/task/<id>` (phone), `/project/<id>`, `/presets/<id>`, the other routes.

The submit sheet a check opens with the pane (`close`) stays out of the address: it opens once,
on the tap that asked for it (as before). Week's calendar events and folded runs stay on-screen
state: the phone's calendar is read again after a reload and what it held may be gone.

Tests: the router fake (`apps/app/src/test/router.ts`) now holds the address's search params
(`setSearchParams`, `searchParams`, `paramsSet`), emptied before every test; Now (wide), Now's
board, Day, Week, Insights, History and Inbox (wide) each test write, reload and a bad param.

## 7. Drafts survive a reload

- `apps/app/src/platform/drafts.ts`: one record of one account's drafts (`{ owner, entries }`),
  each entry the text, the value the field opened with (`base`) and when it was written. Entries
  older than 30 days are dropped, at most 50 kept (newest first). A broken record reads as none,
  a refusing store keeps nothing and never throws.
- Storage: web `localStorage` (`draft-storage.web.ts`, every call behind try/catch); phone
  `expo-sqlite/kv-store` (`draft-storage.ts`), the key-value store of `expo-sqlite`, already a
  dependency (no new package), read and written synchronously so a field restores in its first
  frames.
- Account scope: the owner is an FNV-1a digest of the session token (never the token itself),
  given by `PaceProvider` through `DraftOwnerContext`; another account's first draft replaces the
  record, and every sign-out forgets it (`forgetDrafts()` beside `forgetLineDraft()` in
  `app-state.tsx`, class 103). Signed out, nothing is kept.
- `useDraft(key, value, restore)` (`apps/app/src/ui/use-draft.ts`) and the kit's
  `TextField draftKey` prop (one prop opts a field in). On mount it restores the draft **only
  over the value the field opened with** (an edit of a title changed since, here or on another
  device, is stale and dropped); every later change is written; the text emptied or back to its
  opening value keeps nothing, so a submit that clears the field clears its draft.
  `useDiscardDraft()` drops one on purpose (Cancel, a save that closes a sheet).

Inputs with drafts:

| Input | Key | Cleared |
|---|---|---|
| Now's line | `now.line` (the Add tab's `add.line`) | sent, to Inbox, read later, emptied |
| The time bar's line | `time.line` | approved (the line empties), emptied |
| Task editor: title, description, link, the subtask being added | `task.<id>.title` / `.description` / `.link` / `.subtask` | Save or Close of the editor |
| The quick description editor on the task | `task.<id>.about` (after a reload it opens again, editing) | Save, Cancel |
| Project form (new and edit): name, description | `project.new.*`, `project.<id>.*` | Create/Save, Cancel |
| Preset form: name | `preset.new.name`, `preset.<id>.name` | Save, Delete |

The line restores through the composer's own `onText`, never `type`: a restored line is not read
as a paste, so no assistant request goes on a reload.

Not given drafts, on purpose:
- Secrets and codes: the dev login id, the server address, the code fields (as the brief says).
- The assistant's correction input: the proposal it answers is not kept across a reload, so a
  restored correction would land on another proposal.
- The close sheet's reason and Day's activity editor: their sheet and its target (the mode, the
  block) do not survive a reload, so the words would come back without what they were about.
- Search fields (decisions, task search), the typed estimate (a popover), numbers and dates.

## 8. Links in a task's description

- `splitLinks` in core (`packages/core/src/links.ts`) now finds bare `www.` addresses too (at a
  word start, not inside a word, an address or an e-mail), opened over https; the text is never
  changed (a fast-check property: the parts joined give the text back, each at its place).
- New kit part `TextLink` (`apps/app/src/ui/text-link.tsx` / `.web.tsx`): a link nested in the
  kit's `Text`, in the accent text colour, underlined (an existing pair, `accent.text` on the
  label grounds; no new colour pair, no raw value). The web renders `<a href target="_blank"
  rel="noopener">` whose click stops there; a long address breaks (`break-words`). A phone opens
  the address in the browser through `Linking`.
- The description (`features/task/task-description.tsx`): without an address it stays the one
  button that starts editing. With one it cannot be a button (a link inside a button, bug-lessons
  14 and 132): the words are a pressable text that starts editing, each address a link of its own
  (role link, named by the address). Keyboard and screen-reader users edit it through the task's
  Edit (its form holds the description).

## Deviations

- ~~**Back/forward inside one screen.**~~ **Closed 2026-11-09 (QA round 24 R24-02).** It was a
  deviation: the pane, the day, the filter replaced the history entry (expo-router's tab navigator
  keeps its history length on a param change, so `useLinking` replaced). Now every change
  `useSearchParam` writes is a step on the web: `platform/push-entry.web.ts` dispatches
  `PUSH_ENTRY` just before the param change, and the tabs' router override
  (`ui/tab-history.ts`, `UNSTABLE_router`) grows the tab history by one entry, so `useLinking`
  pushes the address with the whole navigation state; Back resets to the state recorded for the
  entry before, without remounting a screen (the keys are the same). On the web the tabs keep
  every visit (`backBehavior: "fullHistory"`, so a tab switch does not drop the steps); a phone
  keeps its tab Back as before. Writing the value already shown is no step; a pick that clears
  another param in the same action (a week and its block) is one step. Guards:
  `tab-history.test.ts`, `use-search-param.test.tsx`, `reload-state.e2e.ts` (a task: Back closes,
  Forward reopens; Day two days back, Back twice; Week in More's stack).
- **Narrow windows ignore `?task=`.** On a phone the task opens on its own route
  (`/task/<id>`), as before; a wide address opened in a narrow window shows the list.
- **Day's open editor** (the block being edited) is not in the address; only the date is.
- **The composer's expanded form** (Now's new-task form): only its line is a draft. The form's
  fields are the composer's edits over its reading of the line, so after a reload the line comes
  back and the form reads it again; edits typed into the form itself (a changed description, a
  subtask being typed) are not kept.
- **Account scope** is a digest of the session token: a new sign-in (even of the same account)
  starts with no drafts, which sign-out already guarantees.
- **Decisions search** (`/decisions`) keeps its query on the screen; not asked for in the brief.
- Not run here (another session holds the ports): the e2e specs, the design-shots matrix and the
  QA round. New spec: `e2e/reload-state.e2e.ts`.
