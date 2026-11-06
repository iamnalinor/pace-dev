# Synthetic checkpoint CPU and retained-heap measurement

Run the following scratch TypeScript script from the repository root with Bun. It uses the
committed fixture and does not start workerd, Android or QA. This is a process benchmark, not
a Cloudflare billing or CPU measurement. Keep the returned checkpoints alive through GC;
RSS deltas can be negative and are not evidence of retained memory. The source and snapshot
paths include source payload parsing and schema validation, but exclude SQL and hashing.

Recorded results: [JSONL](checkpoint-benchmark-results.jsonl). Nine iterations per size;
medians are environment-dependent. The reported retained heap is the difference after keeping
ten parsed checkpoints, divided by ten; the baseline already retains the fixture and original.

```typescript
import { checkpointHistory } from "./apps/api/tests/checkpoint-fixture.ts";
import { checkpointCutoff, createCheckpoint, parseCheckpoint, replayCheckpoint, parseEvent } from "./packages/core/src/core.ts";
import { heapStats } from "bun:jsc";
import { rebuild } from "./apps/api/src/user-store/state.ts";

const median = (values: number[]) => values.toSorted((a,b)=>a-b)[Math.floor(values.length/2)];
for (const months of [1, 6, 12]) {
  const fixture = checkpointHistory(months);
  const cutoff = checkpointCutoff(fixture.now, "UTC");
  if (!cutoff.ok) throw new Error(cutoff.error);
  const first = fixture.events.findIndex(event=>event.occurredAt >= cutoff.value);
  const coveredSeq = first < 0 ? fixture.events.length : first;
  const built = createCheckpoint({ records: fixture.events.slice(0, coveredSeq).map((event,i)=>({event,seq:i+1})), build:"checkpoint-cost-v1", storeId:"fixture-owner-1234567890", coveredSeq, cutoff:cutoff.value, cutoffTimezone:"UTC" });
  if (!built.ok) throw new Error(built.error);
  const serialized = JSON.stringify(built.value);
  const tail = fixture.events.slice(coveredSeq).map((event,i)=>({event,seq:coveredSeq+i+1}));
  const sourceRows = fixture.events.map(event=>({...event,payload:JSON.stringify(event.payload)}));
  const parseRows = (rows: typeof sourceRows) => rows.map(row=>{ const result=parseEvent({...row,payload:JSON.parse(row.payload)}); if(!result.ok) throw new Error(result.error); return result.value; });
  const fullPath:number[]=[]; const activePath:number[]=[];
  const json:number[]=[]; const validation:number[]=[]; const full:number[]=[]; const active:number[]=[];
  for (let run=0; run<9; run++) {
    let start=performance.now(); const decoded=JSON.parse(serialized); json.push(performance.now()-start);
    start=performance.now(); const parsed=parseCheckpoint(decoded); validation.push(performance.now()-start);
    if (!parsed.ok) throw new Error(parsed.error);
    start=performance.now(); const restored = replayCheckpoint(parsed.value, tail); active.push(performance.now()-start+json.at(-1)!+validation.at(-1)!);
    if (!restored.ok) throw new Error(restored.error);
    start=performance.now(); rebuild({ events:fixture.events,seq:fixture.events.length }); full.push(performance.now()-start);
    start=performance.now(); rebuild({events:parseRows(sourceRows),seq:sourceRows.length}); fullPath.push(performance.now()-start);
    start=performance.now(); const cached=parseCheckpoint(JSON.parse(serialized)); if(!cached.ok) throw new Error(cached.error); replayCheckpoint(cached.value,parseRows(sourceRows.slice(coveredSeq)).map((event,i)=>({event,seq:coveredSeq+i+1}))); activePath.push(performance.now()-start);
  }
  Bun.gc(true);
  const before=process.memoryUsage(); const heapBefore=heapStats().heapSize;
  const retained = Array.from({length: 10},()=>{ const result=parseCheckpoint(JSON.parse(serialized)); if(!result.ok) throw new Error(result.error); return result.value; });
  Bun.gc(true);
  const after=process.memoryUsage(); const heapAfter=heapStats().heapSize;
  process.stdout.write(JSON.stringify({ environment:`Bun ${Bun.version}, Linux x64, synchronous CPU process benchmark (not workerd)`, months, events:fixture.events.length, coveredSeq, tailEvents:tail.length, snapshotBytes:new TextEncoder().encode(serialized).byteLength, medianJsonParseMs:median(json), medianCoreValidationMs:median(validation), medianFullReplayMs:median(full), medianSourceParseAndFullReplayMs:median(fullPath), medianSnapshotParseValidateTailParseReplayMs:median(activePath), medianParseValidateReplayMs:median(active), retainedParsedHeapDeltaPerSnapshotBytes:(after.heapUsed-before.heapUsed)/10, retainedParsedJscHeapDeltaPerSnapshotBytes:(heapAfter-heapBefore)/10, retainedParsedRssDeltaPerSnapshotBytes:(after.rss-before.rss)/10, note:"GC/process noise; baseline retains fixture and original snapshot; delta retains 10 validated parsed checkpoints and divides by 10; snapshots retain full state and all IDs" })+"\n");
  if(retained[0]?.eventCount!==coveredSeq) throw new Error("lost retained checkpoint");
}
```
