import {
  type Checkpoint,
  compareEvents,
  err,
  type Event,
  isCorrection,
  ok,
  parseCheckpoint,
  parseEvent,
  type Result,
  type SequencedCheckpointEvent,
} from "@pace/core";

import type { ValidatedCheckpoint } from "./checkpoint-store-types.ts";

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
      return err("history/incomplete");
    }
    ids.add(parsed.value.id);
    previous = record.seq;
    result.push({ seq: record.seq, event: parsed.value });
  }
  return ok(result);
};

export const requiresSourceForEvent = (checkpoint: Checkpoint, event: Event): boolean =>
  isCorrection(event) ||
  checkpoint.correctionTargets.includes(event.id) ||
  (checkpoint.lastEffective !== null && compareEvents(event, checkpoint.lastEffective) <= 0);
