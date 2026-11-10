import { useRouter } from "expo-router";

import { useT } from "#app/app-state.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";

import { useFeed } from "./use-feed.ts";

/**
The bell (spec §4.3.12): an `IconButton` like every other (no border; F-CMP-06) that opens the
notifications, with the unread count of what this client shows on the glyph's top-right corner,
growing away from it (F-DAT-10, R23-13b). `sidebar` draws the glyph at `icon.control`, a screen
header at `icon.bar`.
*/
export const NotificationBell = ({
  place = "header",
}: {
  readonly place?: "header" | "sidebar";
}) => {
  const t = useT();
  const router = useRouter();
  const { model } = useFeed();
  const label =
    model.unread > 0
      ? t("notifications.openUnread", { count: model.unread })
      : t("notifications.open");
  return (
    <IconButton
      badge={{ count: model.unread, tone: "neutral" }}
      icon="bell"
      label={label}
      onPress={() => {
        router.push("/notifications");
      }}
      size={place === "sidebar" ? "control" : "bar"}
    />
  );
};
