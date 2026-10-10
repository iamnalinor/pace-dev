import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";

import { ChartColumn, Clock, Folder, type LucideIcon, Plus, Zap } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "../app-state.tsx";
import { cx } from "./cx.ts";
import { useIsWide } from "./layout.ts";
import { useTheme } from "./theme-provider.tsx";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const ICONS: Readonly<Record<string, LucideIcon>> = {
  add: Plus,
  day: Clock,
  index: Zap,
  insights: ChartColumn,
  projects: Folder,
};

const ICON_SIZE = 20;
const STROKE = 1.75;

/** Bottom tabs from the Main artboard: five 56×44 targets, the Add one a filled light square. */
const BottomTabs = ({ descriptors, navigation, state }: TabBarProps) => {
  const t = useT();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      aria-label={t("nav.main")}
      className="flex-row justify-around border-t border-line bg-bg px-3 pt-2"
      role="tablist"
      style={{ paddingBottom: Math.max(insets.bottom, 12) + 8 }}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const isAdd = route.name === "add";
        const Icon = ICONS[route.name] ?? Zap;
        const activeColor = isFocused ? palette.fg : palette.faint;
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
            accessibilityLabel={descriptors[route.key]?.options.title ?? route.name}
            accessibilityRole="tab"
            aria-selected={isFocused}
            className={cx("h-11 w-14 items-center justify-center", isAdd && "rounded-lg bg-accent")}
            key={route.key}
            onPress={onPress}
          >
            <Icon
              color={isAdd ? palette.accentFg : activeColor}
              size={ICON_SIZE}
              strokeWidth={STROKE}
            />
          </Pressable>
        );
      })}
    </View>
  );
};

/** Bottom tabs on a phone; a wide window has the root layout's sidebar instead. */
export const TabBar = (props: TabBarProps) => (useIsWide() ? null : <BottomTabs {...props} />);
