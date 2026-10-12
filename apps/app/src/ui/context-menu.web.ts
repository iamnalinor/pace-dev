import type { ContextMenuProps } from "./context-menu.ts";

/** A right click opens the same menu as a long press, instead of the browser's. */
export const contextMenuProps = (open: () => void): ContextMenuProps => ({
  onContextMenu: (event) => {
    event.preventDefault();
    open();
  },
});
