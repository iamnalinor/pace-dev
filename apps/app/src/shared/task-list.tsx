import { memo, useCallback, useRef, useState } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";

import type { NowRow } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { focusedRowPlace, focusRowPlace, type RowPlace } from "#app/platform/focus-place.ts";
import { Button } from "#app/ui/button.tsx";
import { Disclosure } from "#app/ui/disclosure.tsx";
import { Group } from "#app/ui/group.tsx";
import { ROW_ENTER, ROW_EXIT, ROW_LAYOUT } from "#app/ui/motion.ts";

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

/** The rows turning to dust after their check, and the ones whose dust has gone. */
const useSettling = (rows: readonly NowRow[]) => {
  const { check } = useCheckTask();
  // Rows turning to dust after their check; each closes once its dust has gone.
  const [dissolving, setDissolving] = useState<ReadonlySet<string>>(() => new Set());
  // Rows whose dust has gone: they leave the list at once, so the rows below move up as the
  // dust ends, not after the close has been written. A refused close brings the row back.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  // Once the store has dropped a row, forget it: closed again later (undone, then checked
  // again), it dissolves anew. Adjusted while rendering, not in an effect, to skip a stale frame.
  const present = rows.map((row) => row.id).join("\n");
  const [seen, setSeen] = useState(present);
  if (seen !== present) {
    const ids = new Set(rows.map((row) => row.id));
    setSeen(present);
    setDissolving((current) => keeping(current, (id) => ids.has(id)));
    setGone((current) => keeping(current, (id) => ids.has(id)));
  }
  // Where each checked row's focus stood: it goes to the row that takes its place (PR55-1-10).
  const placesRef = useRef(new Map<string, RowPlace>());
  const settle = useCallback(
    async (row: NowRow): Promise<void> => {
      setGone((current) => new Set([...current, row.id]));
      focusRowPlace(placesRef.current.get(row.id) ?? null);
      placesRef.current.delete(row.id);
      const checking = await check(row);
      if (checking.ok) {
        return;
      }

      setGone((current) => keeping(current, (id) => id !== row.id));
      setDissolving((current) => keeping(current, (id) => id !== row.id));
    },
    [check],
  );
  const dissolve = useCallback((row: NowRow): void => {
    placesRef.current.set(row.id, focusedRowPlace());
    setDissolving((current) => new Set([...current, row.id]));
  }, []);
  return { dissolve, dissolving, gone, settle };
};

/**
One row of the list, rendered again only for a change of its own: its task, its dust, the list's
look. The handlers take the row, so the list hands every row the same ones and a check on one row
(or a store change about another task) renders that row alone (bug-lessons 310).
*/
const Row = memo(
  ({
    checked,
    isAnimated,
    isDissolving,
    onCheck,
    onDissolved,
    onOpen,
    row,
    withTag,
  }: {
    readonly checked: boolean;
    readonly isAnimated: boolean;
    readonly isDissolving: boolean;
    readonly onCheck: (row: NowRow) => void;
    readonly onDissolved: (row: NowRow) => void;
    readonly onOpen: (taskId: string) => void;
    readonly row: NowRow;
    readonly withTag: boolean;
  }) => (
    <Animated.View
      entering={ROW_ENTER}
      // The dust is the exit of a checked row; the fade would only bring it back for a moment.
      {...(!isDissolving && { exiting: ROW_EXIT })}
      {...(isAnimated && { layout: ROW_LAYOUT })}
      role="listitem"
    >
      <TaskRow
        checked={checked}
        isDissolving={isDissolving}
        onDissolved={() => {
          onDissolved(row);
        }}
        onOpen={() => {
          onOpen(row.id);
        }}
        row={row}
        withTag={withTag}
        {...(!checked && {
          onCheck: () => {
            onCheck(row);
          },
        })}
      />
    </Animated.View>
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
  animateLayout = true,
  boundary,
  checked = false,
  label,
  rows,
  withTag = true,
}: {
  readonly animateLayout?: boolean;
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
  const { dissolve, dissolving, gone, settle } = useSettling(rows);
  const onDissolved = useCallback(
    (row: NowRow): void => {
      void settle(row);
    },
    [settle],
  );
  const open = rows.filter((row) => !gone.has(row.id));
  const hidden = Math.max(0, open.length - shownCount);
  // A long list turns the layout animation off: sliding a page of rows is not worth the frames.
  const isAnimated = animateLayout && open.length <= PAGE_SIZE;
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
            isAnimated={isAnimated}
            isDissolving={dissolving.has(row.id)}
            key={row.id}
            onCheck={dissolve}
            onDissolved={onDissolved}
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
