import { useEffect, useState } from "react";

import { usePace, useT } from "#app/app-state.tsx";
import { isCalendarSyncOn, setCalendarSync } from "#app/platform/phone-memory.ts";
import { clearPhoneCalendar, uploadPhoneData } from "#app/platform/phone-upload.ts";
import { SwitchRow } from "#app/ui/switch-row.tsx";

/** On a phone: whether its calendar goes to Pace; off deletes the copy there. */
export const CalendarSyncRow = () => {
  const t = useT();
  const { api, clock } = usePace();
  const [isOn, setIsOn] = useState(false);
  useEffect(() => {
    void (async () => {
      const session = api.currentSessionToken();
      if (session === undefined) {
        return;
      }
      const isSaved = await isCalendarSyncOn(session);
      if (api.isCurrentSession(session)) {
        setIsOn(isSaved);
      }
    })();
  }, [api]);
  const change = async (isWanted: boolean): Promise<void> => {
    const session = api.currentSessionToken();
    if (session === undefined) {
      return;
    }
    setIsOn(isWanted);
    await setCalendarSync(session, isWanted, () => api.isCurrentSession(session));
    if (!api.isCurrentSession(session)) {
      return;
    }
    if (isWanted) {
      await uploadPhoneData(api, clock.now());
      return;
    }
    try {
      await clearPhoneCalendar(api, session);
    } catch {
      // Offline: the copy stays until the next time it is turned off; nothing new is sent.
    }
  };
  return (
    <SwitchRow
      hint={t("devices.calendarHint")}
      isOn={isOn}
      label={t("devices.calendar")}
      onChange={(isWanted) => void change(isWanted)}
    />
  );
};
