import { screen } from "@testing-library/react-native";

/**
The rows on screen that slide with a layout transition (`ROW_LAYOUT`) but whose box may be
flattened away by React Native's renderer on Android: their nearest host parent is not marked
`collapsable={false}`. Each is named by its parent's accessibility label, or "?". Only the
direct host parent is checked: rows wrapped in another plain View inside the list would pass
here and still be flattened, so keep a sliding row a direct child of its `RowList`.
*/
export const rowsInFlattenableBoxes = (): readonly string[] => {
  const { root } = screen;
  if (root === null) {
    throw new Error("nothing is rendered");
  }
  return root
    .queryAll((instance) => instance.props["layout"] !== undefined)
    .filter((row) => row.parent?.props["collapsable"] !== false)
    .map((row) =>
      String(row.parent?.props["aria-label"] ?? row.parent?.props["accessibilityLabel"] ?? "?"),
    );
};
