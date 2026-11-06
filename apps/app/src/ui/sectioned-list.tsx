import type { ReactElement, ReactNode } from "react";

import { FlatList, View } from "react-native";

import type { ScrollerProps } from "./screen.tsx";

import { cx } from "./cx.ts";
import { SectionHeader } from "./section-header.tsx";

/** A section of a long list: its heading (with a count, or none) and its rows. */
export type ListSection<Row> = {
  readonly key: string;
  readonly title: string;
  readonly count?: number | undefined;
  readonly rows: readonly Row[];
};

type Place = "first" | "last" | "middle" | "only";

type Item<Row> =
  | { readonly kind: "header"; readonly key: string; readonly section: ListSection<Row> }
  | { readonly kind: "row"; readonly key: string; readonly place: Place; readonly row: Row };

const placeOf = (index: number, length: number): Place => {
  if (length === 1) {
    return "only";
  }
  if (index === 0) {
    return "first";
  }
  return index === length - 1 ? "last" : "middle";
};

const flatten = <Row,>(
  sections: readonly ListSection<Row>[],
  rowKey: (row: Row) => string,
): readonly Item<Row>[] =>
  sections.flatMap((section): readonly Item<Row>[] =>
    section.rows.length === 0
      ? []
      : [
          { key: `header:${section.key}`, kind: "header", section },
          ...section.rows.map(
            (row, index): Item<Row> => ({
              key: `row:${rowKey(row)}`,
              kind: "row",
              place: placeOf(index, section.rows.length),
              row,
            }),
          ),
        ],
  );

const CORNERS: Readonly<Record<Place, string>> = {
  first: "rounded-t-lg",
  last: "rounded-b-lg",
  middle: "",
  only: "rounded-lg",
};

/**
One row of a grouped list that is drawn on its own (a virtualised list cannot wrap its rows in a
`Group`): the cell ground inside the gutter, the large radius at the group's ends only, a hairline
inset to the text start above every row but the first.
*/
const GroupCell = ({
  children,
  place,
}: {
  readonly children: ReactNode;
  readonly place: Place;
}) => (
  <View className={cx("mx-gutter overflow-hidden bg-cell", CORNERS[place])}>
    {place === "first" || place === "only" ? null : (
      <View className="ml-row-x border-t border-separator" testID="group-separator" />
    )}
    {children}
  </View>
);

/**
A long grouped list that renders only the rows near the window (spec F-DAT-03): `SectionHeader`s
over rows that read as `Group`s. It scrolls itself, with the screen's column, foot room and scroll
edge (`scroll`, from `Screen`'s `scroller`). A list with no rows draws `empty` instead, and no
list at all (F-A11Y-18).
*/
export const SectionedList = <Row,>({
  empty,
  header,
  renderRow,
  rowKey,
  scroll,
  sections,
}: {
  readonly scroll: ScrollerProps;
  readonly sections: readonly ListSection<Row>[];
  readonly rowKey: (row: Row) => string;
  readonly renderRow: (row: Row) => ReactElement;
  /** Above the first section (a hint, a search field). */
  readonly header?: ReactElement;
  /** In place of the sections while there are no rows. */
  readonly empty?: ReactElement;
}) => {
  const items = flatten(sections, rowKey);
  return (
    <FlatList
      {...scroll}
      className="flex-1"
      data={items}
      initialNumToRender={24}
      keyExtractor={(item) => item.key}
      {...(header !== undefined && { ListHeaderComponent: header })}
      {...(items.length === 0 && empty !== undefined && { ListFooterComponent: empty })}
      renderItem={({ item }) =>
        item.kind === "header" ? (
          <SectionHeader count={item.section.count} title={item.section.title} />
        ) : (
          <GroupCell place={item.place}>{renderRow(item.row)}</GroupCell>
        )
      }
      windowSize={9}
    />
  );
};
