import {
  type Checkpoint,
  err,
  type Event,
  ok,
  parseCheckpoint,
  parseEvent,
  readPulledEvent,
  requiresSource,
  type Result,
  type SequencedCheckpointEvent,
} from "@pace/core";

import type { ValidatedCheckpoint } from "./checkpoint-store-types.ts";

import { HISTORY_INCOMPLETE } from "./sync-error.ts";

const sets = new WeakMap<readonly string[], ReadonlySet<string>>();
/** A list of ids as a set, made once per list: a checkpoint is asked about every event (class 259). */
export const idSet = (ids: readonly string[]): ReadonlySet<string> => {
  const made = sets.get(ids) ?? new Set(ids);
  sets.set(ids, made);
  return made;
};

export type Sha256Text = (text: string) => Promise<string>;
export const sha256Text: Sha256Text = async (text) => {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
export const validateCheckpoint = async (
  {
    json,
    sha256,
    storeId,
  }: { readonly json: string; readonly sha256: string; readonly storeId: string },
  hash: Sha256Text = sha256Text,
): Promise<Result<ValidatedCheckpoint, "checkpoint/invalid-snapshot">> => {
  if ((await hash(json)) !== sha256) {
    return err("checkpoint/invalid-snapshot");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(json);
  } catch {
    return err("checkpoint/invalid-snapshot");
  }
  const parsed = parseCheckpoint(decoded);
  return parsed.ok && parsed.value.storeId === storeId
    ? ok({ json, sha256, value: parsed.value })
    : err("checkpoint/invalid-snapshot");
};
export const parseSourceRecords = (
  records: readonly { readonly seq: number; readonly event: unknown }[],
): Result<readonly SequencedCheckpointEvent[], "history/incomplete"> => {
  const result: SequencedCheckpointEvent[] = [];
  const ids = new Set<string>();
  let previous = 0;
  for (const record of records) {
    const parsed = parseEvent(record.event);
    if (
      !parsed.ok ||
      !Number.isSafeInteger(record.seq) ||
      record.seq <= previous ||
      ids.has(parsed.value.id)
    ) {
      return err(HISTORY_INCOMPLETE);
    }
    ids.add(parsed.value.id);
    previous = record.seq;
    result.push({ seq: record.seq, event: parsed.value });
  }
  return ok(result);
};

/** The core's one rule (`requiresSource`), with the checkpoint's targets as a set made once. */
export const requiresSourceForEvent = (checkpoint: Checkpoint, event: Event): boolean =>
  requiresSource(checkpoint, idSet(checkpoint.correctionTargets), event);

/** An entry of the tail as this build reads it, or `null` when it cannot (it is left out). */
const readTailEvent = (entry: unknown): Event | null => {
  const pulled = readPulledEvent(entry);
  const parsed = pulled === null ? null : parseEvent(pulled);
  return parsed?.ok === true ? parsed.value : null;
};
/**
A page of the tail, read as the legacy pull reads its pages (bug-lessons 13, 150): an event this
build cannot read (a type a newer client wrote) is left out, a precision or source it has no word
for stands in, and the cursor still moves to the page's `seq`. The page's own shape is the
server's contract and is checked whole: sequence numbers ascend from `since` and end at `seq`
(the store ends a page at its last record), and no id comes twice.
*/
export const readTailRecords = (
  records: readonly { readonly seq: number; readonly event: unknown }[],
  page: { readonly since: number; readonly seq: number },
): Result<readonly SequencedCheckpointEvent[], "history/incomplete"> => {
  const result: SequencedCheckpointEvent[] = [];
  const ids = new Set<string>();
  let previous = page.since;
  for (const record of records) {
    if (!Number.isSafeInteger(record.seq) || record.seq <= previous) {
      return err(HISTORY_INCOMPLETE);
    }
    previous = record.seq;
    const event = readTailEvent(record.event);
    if (event === null) {
      continue;
    }
    if (ids.has(event.id)) {
      return err(HISTORY_INCOMPLETE);
    }
    ids.add(event.id);
    result.push({ seq: record.seq, event });
  }
  return previous === page.seq ? ok(result) : err(HISTORY_INCOMPLETE);
};
