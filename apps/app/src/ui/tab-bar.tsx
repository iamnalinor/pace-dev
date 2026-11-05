import type { Tabs } from "expo-router";

import { type ComponentProps, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MessageKey } from "@pace/core";

import { useT } from "../app-state.tsx";
import { useWaitingCount } from "../shared/use-waiting-count.ts";
import { BadgeAnchor } from "./count-badge.tsx";
import { cx } from "./cx.ts";
import { usePublishTabBar } from "./float-layer.ts";
import { Icon, type IconName } from "./icon.tsx";
import { TAB_BAR_ROLE, TabItem, type TabItemProps } from "./tab-bar-item.tsx";
import { Text } from "./text.tsx";
import { useBreakpoint } from "./use-breakpoint.ts";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0] & {
  /**
  Whether the tabs are the screen in front: a screen pushed over them (a task, Week) leaves the bar
  mounted underneath, and it must not lift the toast while it is out of sight.
  */
  readonly isFront?: boolean;
};

/**
The tabs a phone shows, in order, with their addresses; New task is the composer on Now, not a tab
of its own. Week, Projects, Insights, History and Settings are behind More.
*/
const TABS: Readonly<
  Record<string, { readonly icon: IconName; readonly href: TabItemProps["href"] }>
> = {
  day: { href: "/day", icon: "clock" },
  inbox: { href: "/inbox", icon: "inbox" },
  index: { href: "/", icon: "zap" },
  more: { href: "/more", icon: "ellipsis" },
};

/** The tab that carries a count badge, with its accessibility label (it takes the `{count}`). */
const COUNTED: Readonly<Record<string, MessageKey>> = { inbox: "nav.inboxWaiting" };

/**
What a tab shows (spec §4.2.27): the icon at `icon.bar` on a 64 × 32 pill, filled with `fill.3`
on the current tab, and the name under it in `caption`, wrapping rather than cut (RU at the
largest font scale grows the bar); the current one in `label.primary` semibold, so the cue is
shape and weight, not colour alone (F-AND-02). The Inbox's count sits at the icon's trailing top
and grows outward, inside the tab (F-DAT-10).
*/
const TabFace = ({
  count,
  icon,
  isCurrent,
  title,
}: {
  readonly count: number;
  readonly icon: IconName;
  readonly isCurrent: boolean;
  readonly title: string;
}) => (
  <>
    <View
      className={cx("h-8 w-16 items-center justify-center rounded-pill", isCurrent && "bg-fill-3")}
      testID={isCurrent ? "tab-pill-current" : "tab-pill"}
    >
      <BadgeAnchor count={count} tone="danger">
        <Icon name={icon} size="bar" tone={isCurrent ? "primary" : "secondary"} />
      </BadgeAnchor>
    </View>
    <Text
      chrome
      className={cx("text-center", isCurrent && "font-semibold")}
      role="caption"
      tone={isCurrent ? "primary" : "secondary"}
    >
      {title}
    </Text>
  </>
);

/**
The phone's navigation bar (spec §4.2.27, §5.0.1): four equal destinations on `bg.cell` (a fill
marks it, no hairline), 64 high plus the bottom inset. It tells the toast layer its measured
height, so a toast and the offline pill float above it (F-CMP-12).
*/
const BottomTabs = ({ descriptors, isFront = true, navigation, state }: TabBarProps) => {
  const t = useT();
  const insets = useSafeAreaInsets();
  const waiting = useWaitingCount();
  const [height, setHeight] = useState(0);
  usePublishTabBar(height, isFront);
  // On /add (New task, a share) Now is the screen, with the cursor in the composer.
  const current = state.routes[state.index]?.name;
  return (
    <View
      aria-label={t("nav.main")}
      className="min-h-nav-bar flex-row bg-cell px-1"
      onLayout={(event) => {
        setHeight(event.nativeEvent.layout.height);
      }}
      role={TAB_BAR_ROLE}
      style={{ paddingBottom: insets.bottom }}
      testID="tab-bar"
    >
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (tab === undefined) {
          return null;
        }
        const countedLabel = COUNTED[route.name];
        const count = countedLabel === undefined ? 0 : waiting;
        const title = descriptors[route.key]?.options.title ?? route.name;
        const isCurrent = state.index === index || (route.name === "index" && current === "add");
        return (
          <TabItem
            href={tab.href}
            isCurrent={isCurrent}
            key={route.key}
            label={countedLabel !== undefined && count > 0 ? t(countedLabel, { count }) : title}
            onPress={() => {
              const event = navigation.emit({
                canPreventDefault: true,
                target: route.key,
                type: "tabPress",
              });
              if (!isCurrent && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
          >
            <TabFace count={count} icon={tab.icon} isCurrent={isCurrent} title={title} />
          </TabItem>
        );
      })}
    </View>
  );
};

/** Bottom tabs on a phone; a tablet has the shell's rail and a computer its sidebar instead. */
export const TabBar = (props: TabBarProps) =>
  useBreakpoint() === "compact" ? <BottomTabs {...props} /> : null;
