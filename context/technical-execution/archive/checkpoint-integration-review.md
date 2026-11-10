> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

# Checkpoint integration review

Review method: installed Superpowers requesting-code-review reviewer template;
database, TypeScript, security and silent-failure concerns traced manually.
Requirements: tasks-8-9-plan.md, archive-plan.md, checkpoint-sync-plan.md.
Base: d40e454. Head: the integration checkpoint containing this report; runtime work is reviewed,
with the final mandatory local hook and remote CI tracked separately. Root reviewed code written by the scope authors.

## Strengths

- Archive publication reads back data before publishing the immutable manifest,
  validates both before committing, and retains original source.
- Restore inventory preserves legitimate SQLite sequence gaps and exact raw text.
- Client persistence shares guarded transition helpers across adapters; hashing
  happens outside IndexedDB write transactions and identity is rechecked inside.
- Full-history consumers use explicit coverage, including source-origin actions.

## Findings addressed with regression coverage

1. Critical: a pending batch captured before copy/account replacement could be
   sent using a subsequently read generation. Bind the whole batch to its original
   copy identity and check before each send. Trace both enhanced and legacy sync.
2. Critical: checking identity and then calling an unguarded acknowledgement in
   separate operations permits acknowledgement against a replacement copy.
   Acknowledge through guarded canonical ingestion or an atomic guarded operation.
3. Important: History acquisition readSnapshot/readiness rejections occurred
   outside error normalization. Return the declared failure and preserve retry;
   stale completion must not change the new copy's History resource status.
4. Important: empty pages were allowed to advance cursors in shared validation.
   An empty page must end where it began; numerical gaps between actual records
   remain valid. A corrupt base must not become full empty history by this path.
5. Important: restore's empty-target check must reject stale checkpoint/raw
   bookkeeping as well as visible source. Bound history page arguments explicitly.
6. Important: History mounted before initial bootstrap could finish its first
   full-source check before coverage became partial, then stay loading forever.
   Demand must follow a coverage/copy transition once, without retrying on every
   render, clock tick or failed response.
7. Important: export must bind its awaited history load to the initiating copy;
   an account replacement must not turn the old click into another copy's export.

Focused fix verification: client focused suites cover guarded pending batches,
atomic legacy pages/acknowledgements/version upgrade, acquisition failures,
stale-status fencing and strict empty-page progress. The client author's additional
template pass found same-cursor bootstrap replacing already hydrated history and
direct ingest mutating internal state before replay refusal; both now have passing
regressions. Root's four test-file cleanup run passed25 tests. Restore bounds and
polluted-target regressions passed with the rich workerd recovery rehearsal.

The two app lifecycle findings were reproduced RED, then passed in a seven-test
app run: History mounted before bootstrap now demands full history once after the
coverage transition, and export refuses download after copy/owner replacement.
Independent cross-contract review of the refactored shape is complete; final combined checks remain.

## Cross-contract trace and remaining gates

Cross-contract review covered server bootstrap/routes/live records, both persistent
adapters, client History/export, guarded push acknowledgements, source-mode recovery
and account reset. The opt-in browser test passed with actual partial coverage,
preserved outbox, complete paginated history/export and quiet HTTP/socket steady
state. Full unit verification passed (scripts493, core941, client630, Python54).
Full API833 and app1112 checks also passed. Unified lint is enforced by the
checkpoint commit hook. CI on the pushed head is pending; the owner explicitly
requested stopping after it starts. No merge recommendation is made here.

Independent review of root-authored routes and cleanup refactoring used the same
template and found no critical/important issues. It traced client generation errors,
fixed-high-water history, feature negotiation and cleanup CAS/retry identity. One
minor follow-up remains: nonpending Telegram confirmation replies currently use
English to avoid reading a fenced actor; preserving the request language durably
would improve localized expired/cancelled responses.

Independent review of CI and session fixtures found that an outbox-empty check
must follow both tabs' startup writes. The shared fixture now captures and awaits
each tab's live-sender startup before the final outbox check. Re-review closed the
finding without changing logout or late-401 assertions. The checkpoint CI step
executes explicitly against a fresh named/active test server with the web build
reused; ordinary runs keep the feature off.

PR55 run 42199912608 on d40e454 passed the combined checks but failed one of 198
browser tests. The artifact shows a legitimate pending-write logout confirmation.
The session-only fixtures now wait for the actual outbox; browser rerun is pending.

Root inspected the final cold-alarm fixes: readiness precedes the cleanup fence,
and the absent archive binding returns before zone/aggregate loading. Existing
night-cost14 and sleep11 regressions passed serially; behavior and cost thresholds
were retained. No additional blocking finding in these two changes.

Final gate corrections were limited to accurate optional/discriminated types, test
fixture contract fields, removal of an unused re-export, and shared helpers for
duplicate archive identity/daily dimensions and platform-independent checkpoint
transitions. Root traced the helper extractions: persistence transaction/hash/guard
bodies remain platform-owned, archive validation retains its checks, and schema
columns retain their shape (migration drift is checked by the hook). Focused API
regressions after extraction:27 passed; both persistent adapters:60 passed. The app author's independent review of
root's workbook helper extraction found no blocker. Final browser/session fixture
confirmation is delegated to the new CI run; earlier opt-in checkpoint run passed.
