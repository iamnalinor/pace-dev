/** A focus event as react-native-web passes it: the DOM's fields, or the same under `nativeEvent`. */
type FocusLike = {
  readonly currentTarget?: unknown;
  readonly relatedTarget?: unknown;
  readonly nativeEvent?: { readonly relatedTarget?: unknown };
};

const isInside = (group: unknown, node: unknown): boolean =>
  typeof (group as null | Partial<Element>)?.contains === "function" &&
  node !== null &&
  (group as Element).contains(node as Node);

/**
A roving grid is entered at its one tab stop: focus that lands on another of its cells from
outside the grid (a sheet's focus trap walking its descendants as Shift+Tab wraps, which tries
every focusable element from the last one back) goes on to the stop. Focus moving between the
grid's own cells (a screen reader, a press) stays where it went, never thrown to the page. Unlike
the dim's `refuseFocus`, the trap's walk is told by where focus came from relative to the grid,
not the modal: the trap tries each cell from inside the modal (round 7, class 101).
*/
export const enterAtStop = (event: FocusLike, group: unknown, stop: unknown): void => {
  const from = event.nativeEvent?.relatedTarget ?? event.relatedTarget ?? null;
  if (!isInside(group, from) && stop instanceof HTMLElement) {
    stop.focus();
  }
};
