import { useCallback, useEffect, useState } from "react";

import { usePace } from "#app/app-state.tsx";
import { loadDeviceId } from "#app/platform/device-id.ts";
import { IS_PHONE } from "#app/platform/device.ts";
import { useUsage } from "@pace/client/react";
import { type SatRow, whereSat } from "@pace/core";

/**
Where the time of a block went on the person's devices, from what they sent over [from, to).
On a phone its own apps are left out: the phone shows those itself, in more detail.
*/
export const useWhereSat = (
  from: string,
  to: string,
): ((startAt: string, endAt: string) => readonly SatRow[]) => {
  const { api } = usePace();
  const usage = useUsage(api, from, to);
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
