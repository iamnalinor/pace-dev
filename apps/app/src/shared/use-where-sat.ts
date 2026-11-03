import { useCallback, useEffect, useState } from "react";

import { loadDeviceId } from "#app/platform/device-id.ts";
import { IS_PHONE } from "#app/platform/device.ts";
import { type SatRow, type UsageRow, whereSat } from "@pace/core";

/**
Where the time of a block went on the person's devices, from what they sent (the screen's one
read of the day's usage, QA round 21 L5).
On a phone its own apps are left out: the phone shows those itself, in more detail.
*/
export const useWhereSat = (
  usage: readonly UsageRow[],
): ((startAt: string, endAt: string) => readonly SatRow[]) => {
  const [ownId, setOwnId] = useState<null | string>(null);
  useEffect(() => {
    if (!IS_PHONE) {
      return;
    }
    void (async () => {
      setOwnId(await loadDeviceId());
    })();
  }, []);
  return useCallback(
    (startAt, endAt) =>
      whereSat(
        { endAt, startAt },
        usage.filter((session) => session.deviceId !== ownId),
      ),
    [usage, ownId],
  );
};
