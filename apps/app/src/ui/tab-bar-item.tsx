import type { ReactNode } from "react";

import { Pressable } from "./pressable.tsx";
import { spacePress } from "./space-press.ts";

/** What a tab of the phone's navigation bar takes, on Android and on the web alike. */
export type TabItemProps = {
  readonly children: ReactNode;
  /** The tab's address (the web's `<a href>`); Android navigates by `onPress`. */
  readonly href: "/" | "/day" | "/inbox" | "/more";
  readonly isCurrent: boolean;
  /** What a screen reader says: the title, with what waits behind it if anything. */
  readonly label: string;
  readonly onPress: () => void;
};

/** The bar's role on Android: a tablist, as TalkBack reads Material's navigation bar. */
export const TAB_BAR_ROLE = "tablist";

/**
A tab of the phone's navigation bar on Android (spec §4.2.27): a `tab` TalkBack reads with its
selected state. The web build swaps in `tab-bar-item.web.tsx`, a link with `aria-current`.
*/
export const TabItem = ({ children, href: _web, isCurrent, label, onPress }: TabItemProps) => (
  <Pressable
    className="flex-1 items-center justify-start gap-1 pb-3 pt-3"
    label={label}
    onPress={onPress}
    role="tab"
    selected={isCurrent}
    {...spacePress(onPress)}
  >
    {children}
  </Pressable>
);
