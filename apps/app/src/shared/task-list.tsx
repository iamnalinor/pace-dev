import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";

import type { NowRow } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { focusedRowPlace, focusRowPlace, type RowPlace } from "#app/platform/focus-place.ts";
import { Button } from "#app/ui/button.tsx";
import { Disclosure } from "#app/ui/disclosure.tsx";
import { Group } from "#app/ui/group.tsx";

import { useOpenTask } from "./task-opener.tsx";
import { TaskRow } from "./task-row.tsx";
import { useCheckTask } from "./use-check-task.ts";

/** The ids that `isKept` approves; the same set when nothing is dropped, so no render follows. */
const keeping = (
  ids: ReadonlySet<string>,
  isKept: (id: string) => boolean,
): ReadonlySet<string> => {
  const kept = [...ids].filter((id) => isKept(id));
  return kept.length === ids.size ? ids : new Set(kept);
};

/**
Rows drawn at once (spec 4.3.1 Scale): a long list shows this many and a "Show more" row adds as
many again, so a 1 284-task fold mounts a page, not the lot, inside the screen's own scroll.
*/
export const PAGE_SIZE = 30;

/**
A checked row on its way out: the row as it was, the row it stood under when it was checked (`null`:
the first), and where the keyboard focus stood (it goes to the row that takes its place, PR55-1-10).
It is anchored to its neighbour, not to an index: rows checked in a quick run each keep their place
whichever of them is gone first.
*/
type Leaving = { readonly after: null | string; readonly place: RowPlace; readonly row: NowRow };

/** Puts `row` right under `after` (first when `null`); false when `after` is not in the list yet. */
const didPlaceAfter = (list: NowRow[], row: NowRow, after: null | string): boolean => {
  if (after === null) {
    list.unshift(row);
    return true;
  }
  const at = list.findIndex((each) => each.id === after);
  if (at === -1) {
    return false;
  }
  list.splice(at + 1, 0, row);
  return true;
};

/** `rows` with the leaving rows the store has already dropped put back where they stood. */
const withLeaving = (
  rows: readonly NowRow[],
  leaving: ReadonlyMap<string, Leaving>,
): readonly NowRow[] => {
  const ids = new Set(rows.map((row) => row.id));
  let pending = leaving
    .values()
    .filter(({ row }) => !ids.has(row.id))
    .toArray();
  if (pending.length === 0) {
    return rows;
  }
  const merged = [...rows];
  // A row may stand under another leaving row: place what can be placed until nothing moves.
  for (let isMoving = true; isMoving && pending.length > 0; ) {
    const before = pending.length;
    pending = pending.filter(({ after, row }) => !didPlaceAfter(merged, row, after));
    isMoving = pending.length < before;
  }
  // Its neighbour has gone some other way: it ends the list until it has gone too.
  merged.push(...pending.map(({ row }) => row));
  return merged;
};

const without = <Value,>(map: ReadonlyMap<string, Value>, id: string): ReadonlyMap<string, Value> =>
  new Map(map.entries().filter(([key]) => key !== id));

/**
What the store's list says about the rows that were checked: `gone` rows are hidden until the
store drops them (and are forgotten then: closed again later, such a row leaves anew); `dropped`
are leaving rows the store has dropped since their check. A dropped row the store lists again (an
Undo while it was leaving) stops leaving at once and shows as it is. Adjusted while rendering, not
in an effect, to skip a stale frame.
*/
const useStoreDrops = (
  rows: readonly NowRow[],
  leaving: ReadonlyMap<string, Leaving>,
  setLeaving: (
    update: (current: ReadonlyMap<string, Leaving>) => ReadonlyMap<string, Leaving>,
  ) => void,
) => {
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [dropped, setDropped] = useState<ReadonlySet<string>>(() => new Set());
  const present = rows.map((row) => row.id).join("\n");
  const [seen, setSeen] = useState(present);
  if (seen !== present) {
    const ids = new Set(rows.map((row) => row.id));
    setSeen(present);
    setGone((current) => keeping(current, (id) => ids.has(id)));
    const left = leaving
      .keys()
      .filter((id) => !ids.has(id) && !dropped.has(id))
      .toArray();
    const back = dropped
      .values()
      .filter((id) => ids.has(id))
      .toArray();
    if (left.length > 0 || back.length > 0) {
      setDropped(new Set([...dropped, ...left].filter((id) => !back.includes(id))));
    }
    if (back.length > 0) {
      setLeaving((current) => new Map(current.entries().filter(([id]) => !back.includes(id))));
    }
  }
  return { dropped, gone, setDropped, setGone };
};

/**
The rows leaving after their check (spec §6): the close is written the moment the check is
pressed and never gates the motion (bug-lessons 3), so a leaving row is kept here, as it was, until
its animation reports it has finished, even once the store has dropped it. A row whose animation
ended before the store dropped it stays `gone` meanwhile; a refused close brings the row back. A
second press on a leaving row does nothing: the close is written once (bug-lessons 369).
*/
const useSettling = (rows: readonly NowRow[]) => {
  const { check } = useCheckTask();
  const [leaving, setLeaving] = useState<ReadonlyMap<string, Leaving>>(() => new Map());
  const { dropped, gone, setDropped, setGone } = useStoreDrops(rows, leaving, setLeaving);
  const shown = withLeaving(
    rows.filter((row) => !gone.has(row.id)),
    leaving,
  );
  // What the handlers read, kept current after each commit, so they stay the same functions and a
  // memoised row is not rendered again for them (bug-lessons 310).
  const latestRef = useRef({ dropped, leaving, rows, shown });
  useLayoutEffect(() => {
    latestRef.current = { dropped, leaving, rows, shown };
  });
  // The rows whose close was started, written at the press itself: a second tap comes before the
  // commit that would tell it the row is leaving.
  const startedRef = useRef(new Set<string>());
  useEffect(() => {
    for (const id of startedRef.current) {
      if (!leaving.has(id)) {
        startedRef.current.delete(id);
      }
    }
  }, [leaving]);
  const start = useCallback(
    (row: NowRow): void => {
      if (startedRef.current.has(row.id)) {
        return;
      }
      startedRef.current.add(row.id);
      const place = focusedRowPlace();
      // Where it stood, read from the list at the press: a row is not told its place, or every row
      // under a leaving one would render again as the list closes up (bug-lessons 310).
      const list = latestRef.current.shown;
      const at = list.findIndex((each) => each.id === row.id);
      const after = at > 0 ? (list[at - 1]?.id ?? null) : null;
      setLeaving((current) => new Map([...current, [row.id, { after, place, row }]]));
      void (async () => {
        const checking = await check(row);
        if (checking.ok) {
          return;
        }

        setLeaving((current) => without(current, row.id));
        setGone((current) => keeping(current, (id) => id !== row.id));
        setDropped((current) => keeping(current, (id) => id !== row.id));
      })();
    },
    [check, setDropped, setGone],
  );
  const finish = useCallback(
    (row: NowRow): void => {
      const latest = latestRef.current;
      const entry = latest.leaving.get(row.id);
      if (entry === undefined) {
        return;
      }
      setLeaving((current) => without(current, row.id));
      setDropped((current) => keeping(current, (id) => id !== row.id));
      // Still in the store (the close is being written) and never dropped: hidden until it is.
      if (!latest.dropped.has(row.id) && latest.rows.some((each) => each.id === row.id)) {
        setGone((current) => new Set([...current, row.id]));
      }
      focusRowPlace(entry.place);
    },
    [setDropped, setGone],
  );
  return { finish, leaving, shown, start };
};

/**
One row of the list, rendered again only for a change of its own: its task, whether it is leaving,
the list's look. The handlers take the row, so the list hands every row the same ones
and a check on one row (or a store change about another task) renders that row alone
(bug-lessons 310). No entering or exiting motion: a list that mounts, a filter that changes and a
row made by a hotkey are instant (F-MOT-07); the one motion is the checked row leaving.
*/
const Row = memo(
  ({
    checked,
    isLeaving,
    onCheck,
    onLeft,
    onOpen,
    row,
    withTag,
  }: {
    readonly checked: boolean;
    readonly isLeaving: boolean;
    readonly onCheck: (row: NowRow) => void;
    readonly onLeft: (row: NowRow) => void;
    readonly onOpen: (taskId: string) => void;
    readonly row: NowRow;
    readonly withTag: boolean;
  }) => (
    <View role="listitem">
      <TaskRow
        checked={checked}
        isDissolving={isLeaving}
        onDissolved={() => {
          onLeft(row);
        }}
        onOpen={() => {
          // A row on its way out is a task just closed: nothing to open (it is gone in a moment).
          if (!isLeaving) {
            onOpen(row.id);
          }
        }}
        row={row}
        withTag={withTag}
        {...(!checked && {
          onCheck: () => {
            onCheck(row);
          },
        })}
      />
    </View>
  ),
);

/** The key of the first row of the second kind, with the boundary's name; none when only one kind is shown. */
const boundaryOf = (
  shown: readonly NowRow[],
  boundary: undefined | { readonly isAfter: (row: NowRow) => boolean; readonly label: string },
): Readonly<Record<string, string>> | undefined => {
  const first = shown.findIndex((row) => boundary?.isAfter(row) === true);
  const row = shown[first];
  return boundary === undefined || row === undefined || first === 0
    ? undefined
    : { [row.id]: boundary.label };
};

/** A list of task rows: tap to open, the check to close. */
export const TaskRows = ({
  boundary,
  checked = false,
  label,
  rows,
  withTag = true,
}: {
  /** Where the rows change kind: the first open row `isAfter` holds a labelled edge-to-edge rule above it. */
  readonly boundary?: { readonly isAfter: (row: NowRow) => boolean; readonly label: string };
  /** Closed tasks: checked rows that open the task (reopen is there). */
  readonly checked?: boolean;
  readonly label: string;
  readonly rows: readonly NowRow[];
  readonly withTag?: boolean;
}) => {
  const t = useT();
  const openTask = useOpenTask();
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const { finish, leaving, shown: open, start } = useSettling(rows);
  const hidden = Math.max(0, open.length - shownCount);
  return (
    <>
      <Group
        aria-label={label}
        boundaries={boundaryOf(open.slice(0, shownCount), boundary)}
        role="list"
        separatorInset="check"
      >
        {open.slice(0, shownCount).map((row) => (
          <Row
            checked={checked}
            isLeaving={leaving.has(row.id)}
            key={row.id}
            onCheck={start}
            onLeft={finish}
            onOpen={openTask}
            row={row}
            withTag={withTag}
          />
        ))}
      </Group>
      {hidden === 0 ? null : (
        <Button
          onPress={() => {
            setShownCount((current) => current + PAGE_SIZE);
          }}
          variant="plain"
        >
          {t("now.showMore", { count: Math.min(hidden, PAGE_SIZE) })}
        </Button>
      )}
    </>
  );
};

/**
A section folded by default under its title and count ("In future · 3", "Done · 11"): the kit's
`Disclosure`, the one fold of the app. Nothing to fold, no fold.
*/
export const FoldedSection = ({
  children,
  count,
  initiallyOpen = false,
  title,
}: {
  readonly children: React.ReactNode;
  readonly count: number;
  readonly initiallyOpen?: boolean;
  readonly title: string;
}) => {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  if (count === 0) {
    return null;
  }
  return (
    <View className="mt-2">
      {/* The hairline that set the fold apart from the list above it, kept from before the kit. */}
      <View className="mx-gutter border-t border-separator" testID="fold-hairline" />
      <Disclosure
        count={count}
        label={title}
        onToggle={() => {
          setIsOpen(!isOpen);
        }}
        open={isOpen}
      >
        {children}
      </Disclosure>
    </View>
  );
};
