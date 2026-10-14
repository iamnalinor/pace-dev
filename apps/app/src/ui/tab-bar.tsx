import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";

import { CalendarRange, Clock, Ellipsis, Inbox, type LucideIcon, Zap } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MessageKey } from "@pace/core";

import { useT } from "../app-state.tsx";
import { useWaitingCount } from "../shared/use-waiting-count.ts";
import { CountBadge } from "./count-badge.tsx";
import { cx } from "./cx.ts";
import { useIsWide } from "./layout.ts";
import { useTheme } from "./theme-provider.tsx";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/**
The tabs a phone shows, in order; New task is the composer on Now, not a tab of its own.
Projects, Insights, History and Settings are behind More.
*/
const ICONS: Readonly<Record<string, LucideIcon>> = {
  index: Zap,
  day: Clock,
  calendar: CalendarRange,
  inbox: Inbox,
  more: Ellipsis,
};

/** The tab that carries a count badge, with its accessibility label (it takes the `{count}`). */
const COUNTED: Readonly<Record<string, MessageKey>> = { inbox: "nav.inboxWaiting" };

const ICON_SIZE = 20;
const STROKE = 1.75;

/** One tab: an icon over its name; the Inbox's carries the count of what waits. */
const Tab = ({
  count,
  Icon,
  isFocused,
  label,
  onPress,
  title,
}: {
  readonly count: number;
  /** What a screen reader says; the title when nothing more is to be told. */
  readonly label: string;
  readonly Icon: LucideIcon;
  readonly isFocused: boolean;
  readonly onPress: () => void;
  readonly title: string;
}) => {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      aria-selected={isFocused}
      className="min-h-12 flex-1 items-center justify-center gap-0.5"
      onPress={onPress}
    >
      <View>
        <Icon
          color={isFocused ? palette.accentQuietText : palette.muted}
          size={ICON_SIZE}
          strokeWidth={STROKE}
        />
        <View className="absolute -right-3 -top-1.5">
          <CountBadge count={count} />
        </View>
      </View>
      <Text
        className={cx(
          "font-sans text-[11px]",
          isFocused ? "font-medium text-accentQuietText" : "text-muted",
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
      className="flex-row border-t border-line bg-bg px-1 pt-1.5"
      role="tablist"
      style={{ paddingBottom: Math.max(insets.bottom, 8) + 4 }}
    >
      {state.routes.map((route, index) => {
        const Icon = ICONS[route.name];
        if (Icon === undefined) {
          return null;
        }
        const countedLabel = COUNTED[route.name];
        const count = countedLabel === undefined ? 0 : waiting;
        const title = descriptors[route.key]?.options.title ?? route.name;
        const isFocused = state.index === index || (route.name === "index" && current === "add");
        return (
          <Tab
            count={count}
            Icon={Icon}
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

/** Bottom tabs on a phone; a wide window has the root layout's sidebar instead. */
export const TabBar = (props: TabBarProps) => (useIsWide() ? null : <BottomTabs {...props} />);
