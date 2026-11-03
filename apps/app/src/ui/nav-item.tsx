import type { Href } from "expo-router";

import { View } from "react-native";

import { CountBadge } from "./count-badge.tsx";
import { cx } from "./cx.ts";
import { Icon, type IconName } from "./icon.tsx";
import { Link } from "./link.tsx";
import { SelectedBar } from "./list-row.tsx";
import { Text } from "./text.tsx";

/**
Where the person is, from a destination's point of view: on its own `page`, inside its `section`
(a screen it owns that has no row of its own: a task under Now, Presets under Settings), or
elsewhere.
*/
export type NavCurrent = "page" | "section" | null;

/** What the ARIA says of each: the page itself, or the current item of the set it belongs to. */
export const ARIA_CURRENT = { page: "page", section: "true" } as const;

export type NavItemProps = {
  readonly href: Href;
  readonly icon: IconName;
  /** The visible name. */
  readonly title: string;
  /** What a screen reader says: the name, with what waits behind it if anything. */
  readonly label: string;
  /** What waits behind it (the Inbox's badge); 0 for none. */
  readonly count: number;
  readonly current: NavCurrent;
};

/**
A row of the sidebar (spec §4.2.22): a link 44 high (`size.hitWeb`), `radius.sm`, the icon at
`icon.control` and the name in `callout`, the count trailing. The current page gets the `fill.3`
fill, `label.primary` semibold and the same 4 px accent bar as a selected `ListRow`, with
`aria-current="page"`. A screen it owns but does not name (a task, Presets) keeps the bar and the
weight without the fill, and says `aria-current="true"`: the place is told, without claiming to
be the page (R23-14).
*/
export const NavItem = ({ count, current, href, icon, label, title }: NavItemProps) => (
  <Link
    aria-current={current === null ? undefined : ARIA_CURRENT[current]}
    className={cx(
      "relative min-h-hit-web flex-row items-center gap-3 rounded-sm px-3",
      current === "page" && "bg-fill-3",
    )}
    href={href}
    label={label}
  >
    {current === null ? null : <SelectedBar />}
    <Icon name={icon} tone={current === null ? "secondary" : "primary"} />
    <View className="min-w-0 flex-1">
      <Text
        {...(current !== null && { className: "font-semibold" })}
        role="callout"
        tone={current === null ? "secondary" : "primary"}
      >
        {title}
      </Text>
    </View>
    <CountBadge count={count} />
  </Link>
);
