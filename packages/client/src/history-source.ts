import { err, ok, type Result, type SequencedCheckpointEvent } from "@pace/core";

import type { HistoryError } from "./history-types.ts";
import type { PullPage, SyncTransport } from "./sync-transport.ts";

import { parseSourceRecords } from "./checkpoint-validation.ts";

export type HistoryRead = {
  readonly storeId: string;
  readonly through: number;
  readonly pull: SyncTransport["pull"];
  readonly signal?: AbortSignal;
  readonly isCurrent: () => boolean;
};
const isValidPage = (page: PullPage, read: HistoryRead, since: number): boolean =>
  page.storeId === read.storeId &&
  page.since === since &&
  page.bootstrapRequired !== true &&
  page.seq >= since &&
  page.seq <= read.through &&
  (!page.more || page.seq > since);

const pageRecords = ({
  page,
  since,
  seen,
}: {
  readonly page: PullPage;
  readonly since: number;
  readonly seen: ReadonlySet<string>;
}): Result<readonly SequencedCheckpointEvent[], "history/incomplete"> => {
  if (page.records === undefined) {
    return err("history/incomplete");
  }
  const parsed = parseSourceRecords(page.records);
  if (!parsed.ok) {
    return parsed;
  }
  if (
    parsed.value.some(
      (record) => record.seq <= since || record.seq > page.seq || seen.has(record.event.id),
    )
  ) {
    return err("history/incomplete");
  }
  const last = parsed.value.at(-1)?.seq ?? since;
  return last === page.seq ? parsed : err("history/incomplete");
};
type Collected = {
  readonly records: SequencedCheckpointEvent[];
  readonly seen: Set<string>;
  since: number;
};
const readPage = async (read: HistoryRead, collected: Collected) => {
  const page = await read.pull(collected.since, 200, {
    storeId: read.storeId,
    through: read.through,
    checkpointVersion: 1,
    ...(read.signal !== undefined && { signal: read.signal }),
  });
  if (!read.isCurrent()) {
    return err("sync/copy-changed" as const);
  }
  if (!isValidPage(page, read, collected.since)) {
    return err("history/incomplete" as const);
  }
  const parsed = pageRecords({ page, since: collected.since, seen: collected.seen });
  return parsed.ok ? ok({ records: parsed.value, seq: page.seq, more: page.more }) : parsed;
};
const appendRecords = (
  collected: Collected,
  records: readonly SequencedCheckpointEvent[],
): void => {
  const { seen, records: output } = collected;
  for (const record of records) {
    seen.add(record.event.id);
    output.push(record);
  }
};
/** A fixed source prefix, with actual sequence values (which may contain burned holes). */
export const readCompleteSource = async (
  read: HistoryRead,
): Promise<Result<readonly SequencedCheckpointEvent[], HistoryError>> => {
  const collected: Collected = { records: [], seen: new Set(), since: 0 };
  for (;;) {
    const page = await readPage(read, collected);
    if (!page.ok) {
      return page;
    }
    appendRecords(collected, page.value.records);
    collected.since = page.value.seq;
    if (!page.value.more) {
      break;
    }
  }
  return collected.since === read.through ? ok(collected.records) : err("history/incomplete");
};
