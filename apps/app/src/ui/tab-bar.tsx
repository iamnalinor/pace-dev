import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";

import { ChartColumn, Clock, Folder, type LucideIcon, Settings, Zap } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "../app-state.tsx";
import { cx } from "./cx.ts";
import { useIsWide } from "./layout.ts";
import { useTheme } from "./theme-provider.tsx";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** The tabs a phone shows, in order; New task is the composer on Now, not a tab of its own. */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  index: Zap,
  day: Clock,
  projects: Folder,
  insights: ChartColumn,
  settings: Settings,
};

const ICON_SIZE = 20;
const STROKE = 1.75;

/** Bottom tabs: Now, Day, Projects, Insights and Settings, each an icon over its name. */
const BottomTabs = ({ descriptors, navigation, state }: TabBarProps) => {
  const t = useT();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
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
        // On /add (New task, a share) Now is the screen, with the cursor in the composer.
        const current = state.routes[state.index]?.name;
        const isFocused = state.index === index || (route.name === "index" && current === "add");
        const activeColor = isFocused ? palette.accentQuietText : palette.muted;
        const title = descriptors[route.key]?.options.title ?? route.name;
        const onPress = (): void => {
          const event = navigation.emit({
            canPreventDefault: true,
            target: route.key,
            type: "tabPress",
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };
        return (
          <Pressable
            accessibilityLabel={title}
            accessibilityRole="tab"
            aria-selected={isFocused}
            className="min-h-12 flex-1 items-center justify-center gap-0.5"
            key={route.key}
            onPress={onPress}
          >
            <Icon color={activeColor} size={ICON_SIZE} strokeWidth={STROKE} />
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
      })}
    </View>
  );
};

/** Bottom tabs on a phone; a wide window has the root layout's sidebar instead. */
export const TabBar = (props: TabBarProps) => (useIsWide() ? null : <BottomTabs {...props} />);
