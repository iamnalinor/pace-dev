# Isolated archive restore evidence

The actual workerd rehearsal in `apps/api/tests/archive-restore.int.test.ts`
passed all three tests on 2026-11-06. It uses an isolated target actor, selected
remote monthly objects and retained source. No production data or infrastructure
is involved, and original source is not pruned.

The rich fixture includes ten original events, three correction envelopes, an
old open task, a linked activity, equal-time settings, a correction before its
target, a revoked correction and late January events delivered after later months.
Raw usage is extended and renamed after the first immutable archive publication;
the latest selected manifest is restored while its superseded objects remain.
The hot complement deliberately overlaps one archived event and contains an
allocated lower cursor outside that month's partition.

Assertions compare original source rows, materialized state and daily aggregates,
check no notifications were produced, and verify full-source pagination settles.
Separate tests preserve a legitimately burned AUTOINCREMENT cursor and refuse a
target with stale raw-revision metadata without changing its generation.

An independent Bun check passed both returned copies through the real client
`completeHistoryOf` and `exportSheets`. All five sheets were deeply equal:

| Sheet | Rows |
|---|---:|
| tasks | 1 |
| subtasks | 0 |
| activities | 1 |
| projects | 0 |
| events | 10 |

All three correction envelopes are present in the event sheet. The synthetic
workerd output is preserved in `archive-restore-fixture.json`; this is evidence
from this rehearsal, not a substitute for rerunning the integration test after
future restore changes. Worker logging did not reach Vitest output, so the fixture
was extracted using a temporary diagnostic assertion, which was then removed.

To reproduce the independent comparison, run a temporary Bun script from the
repository root using the following body, then remove the script:

```ts
import { isDeepStrictEqual } from "node:util";
import { completeHistoryOf, exportSheets } from "./packages/client/src/client.ts";
const fixture = await Bun.file("context/technical-execution/archive-restore-fixture.json").json();
const sheets = (source: typeof fixture.baseline) => {
  const full = completeHistoryOf({ ...source.state, log: source.log, events: source.log, historyCoverage: "full" });
  if (!full.ok) throw new Error(full.error);
  return exportSheets(full.value, fixture.now);
};
if (!isDeepStrictEqual(sheets(fixture.baseline), sheets(fixture.restored))) {
  throw new Error("restored export differs");
}
console.log("Five export sheets match, including ten source events and three corrections");
```

No browser history/export or checkpoint transport claim follows from this test;
those are separate Task9C integration gates.
