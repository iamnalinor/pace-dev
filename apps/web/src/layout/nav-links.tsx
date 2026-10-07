import { NavLink } from "react-router";

import { useT } from "#web/i18n.tsx";

import { NAV_ITEMS } from "./nav-items.ts";

/** Every section as a labelled link; `inboxCount` shows beside Inbox when given. */
export const NavLinks = ({
  className,
  inboxCount = 0,
  itemClass,
}: {
  readonly className: string;
  readonly itemClass: (state: { readonly isActive: boolean }) => string;
  readonly inboxCount?: number;
}) => {
  const t = useT();
  return (
    <nav aria-label={t("nav.main")} className={className}>
      {NAV_ITEMS.map((item) => (
        <NavLink className={itemClass} end={item.to === "/"} key={item.to} to={item.to}>
          <item.icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          {t(item.labelKey)}
          {item.hasInboxCount === true && inboxCount > 0 && (
            <span className="ml-auto font-mono text-xs text-muted">{inboxCount}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
};
