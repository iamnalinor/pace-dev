import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";

import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MessageKey } from "@pace/core";

import { useT } from "../app-state.tsx";
import { useWaitingCount } from "../shared/use-waiting-count.ts";
import { CountBadge } from "./count-badge.tsx";
import { cx } from "./cx.ts";
import { Icon, type IconName } from "./icon.tsx";
import { spacePress } from "./space-press.ts";
import { useBreakpoint } from "./use-breakpoint.ts";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/**
The tabs a phone shows, in order; New task is the composer on Now, not a tab of its own.
Week, Projects, Insights, History and Settings are behind More.
*/
const ICONS: Readonly<Record<string, IconName>> = {
  index: "zap",
  day: "clock",
  inbox: "inbox",
  more: "ellipsis",
};

/** The tab that carries a count badge, with its accessibility label (it takes the `{count}`). */
const COUNTED: Readonly<Record<string, MessageKey>> = { inbox: "nav.inboxWaiting" };

/** One tab: an icon over its name; the Inbox's carries the count of what waits. */
const Tab = ({
  count,
  icon,
  isFocused,
  label,
  onPress,
  title,
}: {
  readonly count: number;
  /** What a screen reader says; the title when nothing more is to be told. */
  readonly label: string;
  readonly icon: IconName;
  readonly isFocused: boolean;
  readonly onPress: () => void;
  readonly title: string;
}) => {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      aria-selected={isFocused}
      className="min-h-12 flex-1 items-center justify-center gap-0.5"
      onPress={onPress}
      {...spacePress(onPress)}
    >
      <View>
        {/* `control` (20) until the tab bar's rewrite gives it the pill and `bar` (Task 3.10). */}
        <Icon name={icon} tone={isFocused ? "accent" : "secondary"} />
        <View className="absolute -top-2 left-5">
          <CountBadge count={count} />
        </View>
      </View>
      <Text
        className={cx(
          "font-sans text-caption2",
          isFocused ? "font-medium text-accent-text" : "font-normal text-label-secondary",
        )}
        numberOfLines={1}
      >
        {title}
      </Text>
    </Pressable>
  );
};

/** Bottom tabs: Now, Day, Calendar, Inbox and More. */
const BottomTabs = ({ descriptors, navigation, state }: TabBarProps) => {
  const t = useT();
  const insets = useSafeAreaInsets();
  const waiting = useWaitingCount();
  // On /add (New task, a share) Now is the screen, with the cursor in the composer.
  const current = state.routes[state.index]?.name;
  return (
    <View
      aria-label={t("nav.main")}
      className="flex-row border-t border-separator bg-app px-1 pt-2"
      role="tablist"
      style={{ paddingBottom: Math.max(insets.bottom, 8) + 4 }}
    >
      {state.routes.map((route, index) => {
        const icon = ICONS[route.name];
        if (icon === undefined) {
          return null;
        }
        const countedLabel = COUNTED[route.name];
        const count = countedLabel === undefined ? 0 : waiting;
        const title = descriptors[route.key]?.options.title ?? route.name;
        const isFocused = state.index === index || (route.name === "index" && current === "add");
        return (
          <Tab
            count={count}
            icon={icon}
            isFocused={isFocused}
            key={route.key}
            label={countedLabel !== undefined && count > 0 ? t(countedLabel, { count }) : title}
            onPress={() => {
              const event = navigation.emit({
                canPreventDefault: true,
                target: route.key,
                type: "tabPress",
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
            title={title}
          />
        );
      })}
    </View>
  );
};

/** Bottom tabs on a phone; a tablet has the shell's rail and a computer its sidebar instead. */
export const TabBar = (props: TabBarProps) =>
  useBreakpoint() === "compact" ? <BottomTabs {...props} /> : null;
