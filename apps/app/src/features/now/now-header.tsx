import { useLanguage, usePace, useT } from "#app/app-state.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { formatEyebrow } from "@pace/core";

/** Date eyebrow and "Now". The Inbox's count is on its row in the navigation, not here. */
export const NowHeader = () => {
  const t = useT();
  const language = useLanguage();
  const { hooks } = usePace();
  const { deviceTz, now } = hooks.useClock();
  return <ScreenHeader eyebrow={formatEyebrow(now, deviceTz, language)} title={t("nav.now")} />;
};
