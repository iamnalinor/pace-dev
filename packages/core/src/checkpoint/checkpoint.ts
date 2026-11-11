import { z } from "zod";

import { StoreIdSchema } from "../api/schemas/sync.ts";
import { type Event, EventIdSchema, EventSchema } from "../events/event-schema.ts";
import { InstantSchema, TimeZoneSchema } from "../events/payloads.ts";
import { compareEvents, sortEvents } from "../events/sort.ts";
import { coreReducer, type CoreState, INITIAL_CORE_STATE } from "../materialize/core-state.ts";
import { effectiveInOrder, foldEffective, isCorrection } from "../materialize/materializer.ts";
import { err, ok, type Result } from "../result.ts";
import { addDaysIn, startOfDayIn } from "../time.ts";
import { CoreStateSchema } from "./state-schema.ts";
import { CHECKPOINT_VERSION } from "./version.ts";

export { CHECKPOINT_VERSION } from "./version.ts";
export type CheckpointEventKey = { readonly occurredAt: string; readonly id: string };
export type SequencedCheckpointEvent = { readonly seq: number; readonly event: Event };
export type CheckpointValidationError =
  | "checkpoint/invalid-metadata"
  | "checkpoint/invalid-records"
  | "checkpoint/invalid-snapshot";

const MetadataSchema = z.strictObject({
  storeId: StoreIdSchema,
  build: z.string().min(1),
  coveredSeq: z.int().nonnegative(),
  cutoff: InstantSchema,
  cutoffTimezone: TimeZoneSchema,
});
const KeySchema = z.strictObject({ occurredAt: InstantSchema, id: EventIdSchema });
const CheckpointSchema = MetadataSchema.extend({
  version: z.literal(CHECKPOINT_VERSION),
  state: CoreStateSchema,
  eventIds: z.array(EventIdSchema),
  eventCount: z.int().nonnegative(),
  correctionTargets: z.array(z.string().min(1)),
  lastEffective: KeySchema.nullable(),
});
export type Checkpoint = Readonly<
  Omit<
    z.output<typeof CheckpointSchema>,
    "correctionTargets" | "eventIds" | "lastEffective" | "state"
  >
> & {
  readonly lastEffective: CheckpointEventKey | null;
  readonly state: CoreState;
  readonly eventIds: readonly string[];
  readonly correctionTargets: readonly string[];
};
export type CreateCheckpointInput = Readonly<z.output<typeof MetadataSchema>> & {
  readonly records: readonly SequencedCheckpointEvent[];
};
export type CheckpointReplay = {
  readonly state: CoreState;
  readonly ids: readonly string[];
  readonly lastEffective: CheckpointEventKey | null;
  readonly seq: number;
};

const keyOf = (event: Event | undefined): CheckpointEventKey | null =>
  event === undefined ? null : { id: event.id, occurredAt: event.occurredAt };

const RecordsSchema = z.array(z.strictObject({ seq: z.int().positive(), event: EventSchema }));
const parseRecords = (
  input: readonly SequencedCheckpointEvent[],
): Result<readonly SequencedCheckpointEvent[], CheckpointValidationError> => {
  const parsed = RecordsSchema.safeParse(input);
  return !parsed.success ||
    parsed.data.some((record, index, records) => record.seq <= (records[index - 1]?.seq ?? 0))
    ? err("checkpoint/invalid-records")
    : ok(parsed.data);
};

/** Caller supplies a complete source prefix; only persistence can prove source completeness. */
export const createCheckpoint = ({
  records,
  ...metadata
}: CreateCheckpointInput): Result<Checkpoint, CheckpointValidationError> => {
  const parsed = MetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    return err("checkpoint/invalid-metadata");
  }
  const validated = parseRecords(records);
  if (!validated.ok) {
    return validated;
  }
  const events = validated.value.map((record) => record.event);
  const eventIds = events.map((event) => event.id);
  if (
    (validated.value.at(-1)?.seq ?? 0) !== metadata.coveredSeq ||
    new Set(eventIds).size !== eventIds.length
  ) {
    return err("checkpoint/invalid-records");
  }
  const ordered = effectiveInOrder(events);
  return ok({
    ...parsed.data,
    version: CHECKPOINT_VERSION,
    state: foldEffective(ordered, coreReducer, INITIAL_CORE_STATE),
    eventIds,
    eventCount: eventIds.length,
    correctionTargets: [
      ...new Set(events.filter(isCorrection).map((event) => event.payload.targetId)),
    ],
    lastEffective: keyOf(ordered.at(-1)),
  });
};

/** Byte integrity and expected store/build identity belong to the persistence boundary. */
export const parseCheckpoint = (input: unknown): Result<Checkpoint, CheckpointValidationError> => {
  const parsed = CheckpointSchema.safeParse(input);
  if (!parsed.success) {
    return err("checkpoint/invalid-snapshot");
  }
  const snapshot = parsed.data;
  const ids = new Set(snapshot.eventIds);
  return new Set(snapshot.correctionTargets).size !== snapshot.correctionTargets.length ||
    snapshot.correctionTargets.length > snapshot.eventCount ||
    ids.size !== snapshot.eventCount ||
    snapshot.eventIds.length !== snapshot.eventCount ||
    snapshot.eventCount > snapshot.coveredSeq ||
    (snapshot.coveredSeq === 0) !== (snapshot.eventCount === 0) ||
    (snapshot.lastEffective !== null && !ids.has(snapshot.lastEffective.id))
    ? err("checkpoint/invalid-snapshot")
    : ok(snapshot);
};

/**
Whether `event` cannot be folded on top of a checkpoint's state: a correction, an event a known
correction targets (`targets` is `correctionTargets` as a set, made once by the caller), or one
that sorts at or before the last event the state holds. The replay refuses such a tail, and a
client asks for the source before it writes one.
*/
export const requiresSource = (
  snapshot: Checkpoint,
  targets: ReadonlySet<string>,
  event: Event,
): boolean =>
  isCorrection(event) ||
  targets.has(event.id) ||
  (snapshot.lastEffective !== null && compareEvents(event, snapshot.lastEffective) <= 0);

type FreshTail = { readonly events: readonly Event[]; readonly ids: readonly string[] };
const freshTail = (
  snapshot: Checkpoint,
  records: readonly SequencedCheckpointEvent[],
): Result<FreshTail, "checkpoint/rebuild-required"> => {
  const known = new Set(snapshot.eventIds);
  const targets = new Set(snapshot.correctionTargets);
  const fresh: Event[] = [];
  for (const record of records) {
    if (record.seq <= snapshot.coveredSeq || known.has(record.event.id)) {
      continue;
    }
    if (requiresSource(snapshot, targets, record.event)) {
      return err("checkpoint/rebuild-required");
    }
    // eslint-disable-next-line functional/immutable-data -- private replay accumulators never escape
    known.add(record.event.id);
    // eslint-disable-next-line functional/immutable-data -- private replay accumulators never escape
    fresh.push(record.event);
  }
  return ok({ events: sortEvents(fresh), ids: [...known] });
};

/** Corrections and canonical backdates need source replay; projection results cannot reverse a reducer. */
export const replayCheckpoint = (
  checkpoint: Checkpoint,
  tail: readonly SequencedCheckpointEvent[],
): Result<CheckpointReplay, "checkpoint/rebuild-required" | CheckpointValidationError> => {
  const parsed = parseCheckpoint(checkpoint);
  if (!parsed.ok) {
    return parsed;
  }
  const records = parseRecords(tail);
  if (!records.ok) {
    return records;
  }
  const snapshot = parsed.value;
  const fresh = freshTail(snapshot, records.value);
  if (!fresh.ok) {
    return fresh;
  }
  return ok({
    state: foldEffective(fresh.value.events, coreReducer, snapshot.state),
    ids: fresh.value.ids,
    lastEffective: keyOf(fresh.value.events.at(-1)) ?? snapshot.lastEffective,
    seq: Math.max(snapshot.coveredSeq, records.value.at(-1)?.seq ?? 0),
  });
};

/** Calendar-day arithmetic preserves the local midnight boundary across DST changes. */
export const checkpointCutoff = (
  now: string,
  timezone: string,
): Result<string, "checkpoint/invalid-metadata"> => {
  if (!InstantSchema.safeParse(now).success || !TimeZoneSchema.safeParse(timezone).success) {
    return err("checkpoint/invalid-metadata");
  }
  const cutoff = startOfDayIn(addDaysIn(now, -30, timezone), timezone);
  return InstantSchema.safeParse(cutoff).success ? ok(cutoff) : err("checkpoint/invalid-metadata");
};
