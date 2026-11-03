import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { CountBadge } from "#app/ui/count-badge.tsx";
import { cx } from "#app/ui/cx.ts";
import { Icon } from "#app/ui/icon.tsx";
import { Tooltip } from "#app/ui/tooltip.tsx";

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
  const { model } = useFeed();
  const label =
    model.unread > 0
      ? t("notifications.openUnread", { count: model.unread })
      : t("notifications.open");
  return (
    <Tooltip label={label}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        className={cx(
          "h-hit-web w-hit-web items-center justify-center rounded-md active:opacity-80",
          variant === "surface" && "border border-outline bg-cell",
        )}
        onPress={() => {
          router.push("/notifications");
        }}
      >
        <Icon name="bell" />
        <View className="absolute right-0.5 top-0.5">
          <CountBadge count={model.unread} tone="neutral" />
        </View>
      </Pressable>
    </Tooltip>
  );
};
