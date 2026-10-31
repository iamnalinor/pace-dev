import { useEffect, useState } from "react";
import { useStore } from "zustand";

import type { PaceRuntime } from "../runtime.ts";

import { applyInstanceCheck, serverStore } from "./server-store.ts";
import { readServer } from "./server.ts";

/**
The server to build the runtime for: `null` until the stored choice is read into `serverStore`,
then its origin (a switch on the login screen changes it, and the runtime is built again).
*/
export const useServerOrigin = (isNeeded: boolean): null | string => {
  const [isRead, setIsRead] = useState(false);
  const origin = useStore(serverStore, (state) => state.origin);
  useEffect(() => {
    if (!isNeeded) {
      return;
    }
    void (async () => {
      serverStore.setState({ origin: await readServer() });
      setIsRead(true);
    })();
  }, [isNeeded]);
  return isRead ? origin : null;
};

/**
Asks the runtime's server what it is and whether it fits this app (on start and each sign-in),
into `serverStore`; the versions screen and the login refusal read it from there.
*/
export const checkServer = (runtime: Pick<PaceRuntime, "baseUrl" | "checkInstance">): void => {
  void (async () => {
    applyInstanceCheck(runtime.baseUrl, await runtime.checkInstance());
  })();
};
