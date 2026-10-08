import { createContext, type ReactNode, use } from "react";
import { createPortal } from "react-dom";

/** The strip pinned to the bottom of the screen, above the phone tab bar. */
export const DockContext = createContext<HTMLElement | null>(null);

/** Renders its children into the dock; without one (a test, a bare page) they stay in place. */
export const Dock = ({ children }: { readonly children: ReactNode }) => {
  const target = use(DockContext);
  return target === null ? children : createPortal(children, target);
};
