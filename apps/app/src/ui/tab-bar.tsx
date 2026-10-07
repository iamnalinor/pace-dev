import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";

import { ChartColumn, Clock, Folder, type LucideIcon, Plus, Zap } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cx } from "./cx.ts";
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
export const TabBar = ({ descriptors, navigation, state }: TabBarProps) => {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row justify-around border-t border-line bg-bg px-3 pt-2"
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
            accessibilityState={{ selected: isFocused }}
            className={cx(
              "h-11 w-14 items-center justify-center",
              isAdd && "rounded-lg bg-inverse",
            )}
            key={route.key}
            onPress={onPress}
          >
            <Icon
              color={isAdd ? palette.inverseFg : activeColor}
              size={ICON_SIZE}
              strokeWidth={STROKE}
            />
          </Pressable>
        );
      })}
    </View>
  );
};
