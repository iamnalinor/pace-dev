import type { ActivityRange, ActivityTarget as SheetTarget } from "@pace/client";

import { type Activity, type TimeState, yieldsTo } from "@pace/core";

import type { Read } from "./activity-draft.ts";

/** What saving the draft would do to the other blocks of the main line. */
export type Overlap = {
  /** It would cover the start of a later block (or one with the same start): refused. */
  readonly next: boolean;
  /** It would cut into a block before it that does not give time up: refused. */
  readonly previous: boolean;
  /** A block it cuts or splits, which gives that time up: said, not refused. */
  readonly yieldsFrom: null | string;
  /** A block a new one covers whole, which goes: said, not refused (owner, R27-05). */
  readonly removes: null | string;
};

const NO_OVERLAP: Overlap = { next: false, previous: false, removes: null, yieldsFrom: null };

type Clash = {
  readonly id: string;
  readonly label: string;
  readonly isLater: boolean;
  readonly isYielding: boolean;
};

/** The other main blocks a range of the draft shares time with (touching is not sharing). */
const clashesOf = (
  others: readonly Activity[],
  range: ActivityRange,
  { isLogged, now }: { readonly isLogged: boolean; readonly now: string },
): readonly Clash[] => {
  const start = Date.parse(range.startAt);
  const end = Date.parse(range.endAt ?? now);
  return others
    .map((other) => ({
      end: Date.parse(other.endAt ?? now),
      other,
      start: Date.parse(other.startAt),
    }))
    .filter((span) => span.start < end && span.end > start)
    .map(({ end: otherEnd, other, start: otherStart }) => ({
      id: other.id,
      // A later start is the next block; with the same start, the next one only when the draft
      // runs past its end (it would swallow it), else the draft lies inside it: the block before
      // (QA round 27 R27-05).
      isLater: otherStart > start || (otherStart === start && otherEnd < end),
      // A logged block wins over the live time it covers: the live one before it gives it up.
      isYielding: isLogged && !other.isLogged && otherStart < start,
      label: other.label,
    }));
};

/**
A new past block takes its time from every block it lands on, «как в календаре», live or logged;
one it covers whole goes. The write does the same (`yieldsTo`; owner, R27-05).
*/
const newBlockOverlap = (
  time: TimeState,
  span: { readonly startAt: string; readonly endAt: string },
  now: string,
): Overlap => {
  const yields = yieldsTo(time, span, now);
  return {
    ...NO_OVERLAP,
    removes: yields.find((item) => item.isWhole)?.activity.label ?? null,
    yieldsFrom: yields.find((item) => !item.isWhole)?.activity.label ?? null,
  };
};

/**
What the draft's range does to the other blocks of the main line. A new past block (a gap's Log,
Log past) takes its time out of every block it lands on, «как в календаре», live or logged, and
the sheet names the one it cuts and the one it removes whole (owner, 2026-11-10, R27-05; it was
refused for logged neighbours in R26-03). An edit of a block already on the line may not share
time with another one, a later or earlier one, the same start included, because the timeline
would cut one of them back without a word; its one exception: a logged block put into the time of
a live one that began before it takes that time out of it, and the sheet says so. A block run
alongside never clashes, nor does what an edit already shared before it (a rename of a live block
with lunch logged inside it).
*/
export const overlapOf = (
  time: TimeState,
  {
    now,
    range,
    target,
  }: { readonly target: SheetTarget; readonly range: ActivityRange; readonly now: string },
): Overlap => {
  if (target.kind === "log" && range.endAt !== null) {
    return newBlockOverlap(time, { endAt: range.endAt, startAt: range.startAt }, now);
  }
  const self = target.kind === "edit" ? time.activities[target.activityId] : undefined;
  if (self?.isAlongside === true) {
    return NO_OVERLAP;
  }
  const others = Object.values(time.activities).filter(
    (activity) => !activity.isAlongside && activity.id !== self?.id,
  );
  const how = { isLogged: self === undefined || self.isLogged, now };
  const shared = new Set(
    target.kind === "edit" ? clashesOf(others, target, how).map((clash) => clash.id) : [],
  );
  const clashes = clashesOf(others, range, how);
  const fresh = clashes.filter((clash) => !clash.isYielding && !shared.has(clash.id));
  return {
    next: fresh.some((clash) => clash.isLater),
    previous: fresh.some((clash) => !clash.isLater),
    removes: null,
    yieldsFrom: clashes.find((clash) => clash.isYielding)?.label ?? null,
  };
};

/**
The draft refused where it would overlap: covering a later block is said under the end (under the
start for a running block, which has no end to type), cutting into an earlier one under the start.
*/
export const notOverlapping = (read: Read, overlap: Overlap, hasEndField: boolean): Read => {
  if (!overlap.next && !overlap.previous) {
    return read;
  }
  const isNextUnderEnd = overlap.next && hasEndField;
  return {
    faults: {
      ...read.faults,
      ...(overlap.previous && { from: "day.overlapsPrevious" }),
      ...(overlap.next && !isNextUnderEnd && { from: "day.overlapsNext" }),
      ...(isNextUnderEnd && { to: "day.overlapsNext" }),
    },
    range: null,
  };
};
