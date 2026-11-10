import type { TabItemProps } from "./tab-bar-item.tsx";

// The web Link by its own name: the web build swaps it in anyway; jest does not (tab-bar.web.test).
import { Link } from "./link.web.tsx";

export type { TabItemProps } from "./tab-bar-item.tsx";

/** The bar's role on the web: a `nav` landmark of links, not a tablist (F-A11Y-11). */
export const TAB_BAR_ROLE = "navigation";

/**
A tab of the phone web's navigation bar (spec §4.2.27, F-A11Y-11, F-WEB-03): an `<a href>` (a long
press or Ctrl-click opens it apart), the current one `aria-current="page"`.
*/
export const TabItem = ({ children, href, isCurrent, label }: TabItemProps) => (
  <Link
    aria-current={isCurrent ? "page" : undefined}
    className="flex-1 items-center justify-start gap-1 pb-3 pt-3"
    href={href}
    label={label}
  >
    {children}
  </Link>
);
