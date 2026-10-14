import { useRouter } from "expo-router";
import { Bell } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { CountBadge } from "#app/ui/count-badge.tsx";
import { cx } from "#app/ui/cx.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";

import { useFeed } from "./use-feed.ts";

/**
The bell: opens the notifications, with the unread count of what this client shows. `plain`
sits in the sidebar's header, `surface` in a screen header.
*/
export const NotificationBell = ({
  variant = "surface",
}: {
  readonly variant?: "plain" | "surface";
}) => {
  const t = useT();
  const router = useRouter();
  const { palette } = useTheme();
  const { model } = useFeed();
  return (
    <Pressable
      accessibilityLabel={
        model.unread > 0
          ? t("notifications.openUnread", { count: model.unread })
          : t("notifications.open")
      }
      accessibilityRole="button"
      className={cx(
        "h-11 w-11 items-center justify-center rounded-md active:opacity-80",
        variant === "surface" && "border border-line bg-surface",
      )}
      onPress={() => {
        router.push("/notifications");
      }}
    >
      <Bell color={palette.fg2} size={18} strokeWidth={1.75} />
      <View className="absolute right-0.5 top-0.5">
        <CountBadge count={model.unread} />
      </View>
    </Pressable>
  );
};
