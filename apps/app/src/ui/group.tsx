import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";

import { cx } from "./cx.ts";
import { RowList } from "./row-list.tsx";

/**
Where a separator starts (spec §4.1.1: inset to the text start): `row` at the row's own padding
(rows without a leading slot), `icon` past a leading `icon.control` (16 + 20 + 12 = 48), `none`
edge to edge. A row type with another leading width (the task row's check) adds its own here.
*/
export type SeparatorInset = "check" | "icon" | "none" | "row";

const INSET_CLASS: Readonly<Record<SeparatorInset, string>> = {
  check: "ml-16",
  icon: "ml-12",
  none: "",
  row: "ml-row-x",
};

/**
The hairline between two rows. A labelled one (a boundary) is a `separator` in a list, which a list
may only hold inside a list item (axe `aria-required-children`).
*/
const Separator = ({
  boundary,
  inset,
}: {
  readonly boundary: string | undefined;
  readonly inset: SeparatorInset;
}) => {
  const line = (
    <View
      className={cx("border-t border-separator", INSET_CLASS[inset])}
      testID="group-separator"
      {...(boundary !== undefined && { "aria-label": boundary, role: "separator" })}
    />
  );
  return boundary === undefined ? line : <View role="listitem">{line}</View>;
};

/**
An inset grouped list (spec §4.1.1, §5.0.3): rows on the cell ground with the large radius and no
border, a hairline in `separator` only between two rows, inset to the text start. On a phone the
group sits inside the screen's gutter (`inset`). It is a `RowList`, so Android keeps it a view of
its own and its rows slide as one (bug-lessons 11).
*/
export const Group = ({
  boundaries,
  children,
  className,
  inset = true,
  separatorInset = "row",
  ...rest
}: ViewProps & {
  /**
  Row keys that start a new kind of row, each with the name of what starts there: the hairline
  above such a row runs edge to edge and is a labelled separator (Now: the tasks without a deadline).
  */
  readonly boundaries?: Readonly<Record<string, string>> | undefined;
  readonly children: ReactNode;
  /** Inside the screen's gutter (the default), or edge to edge in a pane that has its own. */
  readonly inset?: boolean;
  readonly separatorInset?: SeparatorInset;
}) => {
  // `null`, `false` and `undefined` (rows left out by a condition) are no rows; toArray keys each.
  // eslint-disable-next-line @eslint-react/no-children-to-array -- a separator goes between two rows, so the group must see which children are rows
  const rows = Children.toArray(children).filter((child) => isValidElement(child));
  // An empty group is no cell at all (an empty box reads as a broken list; F-A11Y-18).
  if (rows.length === 0) {
    return null;
  }
  return (
    <RowList
      {...rest}
      className={cx("overflow-hidden rounded-lg bg-cell", inset && "mx-gutter", className)}
    >
      {rows.map((row) => {
        // `Children.toArray` prefixes every key with ".$".
        const boundary = boundaries?.[String(row.key).replace(/^\.\$/u, "")];
        const inset: SeparatorInset = boundary === undefined ? separatorInset : "none";
        return (
          <Fragment key={row.key}>
            {row === rows[0] ? null : <Separator boundary={boundary} inset={inset} />}
            {row}
          </Fragment>
        );
      })}
    </RowList>
  );
};
