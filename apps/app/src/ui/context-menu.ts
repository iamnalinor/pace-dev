/** What a pressable gets to open its menu on a right click. */
export type ContextMenuProps = {
  readonly onContextMenu?: (event: { readonly preventDefault: () => void }) => void;
};

/** Nothing on a phone: a long press opens the menu there (the web build swaps in a right click). */
export const contextMenuProps = (_open: () => void): ContextMenuProps => ({});
