import { useLanguage, usePace, useT } from "#app/app-state.tsx";
import { NotificationBell } from "#app/shared/notifications/notification-bell.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { formatEyebrow } from "@pace/core";

/**
"Now" with the date under it, and the notifications bell on a phone (beside the sidebar it sits
in the sidebar's header). The Inbox's count is on its row in the navigation, not here.
*/
export const NowHeader = () => {
  const t = useT();
  const language = useLanguage();
  const { hooks } = usePace();
  const { deviceTz, now } = hooks.useClock();
  const isWide = useIsWide();
  return (
    <ScreenHeader
      actions={isWide ? undefined : <NotificationBell />}
      subtitle={formatEyebrow(now, deviceTz, language)}
      title={t("nav.now")}
      variant="top"
    />
  );
};
