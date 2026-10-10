/** Settings → Devices: what sends app usage, connecting a computer, disconnecting one. */
import { useCallback, useEffect, useState } from "react";

import { type Device, endpoints } from "@pace/core";

import type { ApiClient } from "../api-client.ts";

export type DevicesPhase =
  | { readonly kind: "failed" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly devices: readonly Device[] };

/** A computer just connected: its token is shown this once. */
export type NewDevice = { readonly id: string; readonly name: string; readonly token: string };

export type Devices = {
  readonly phase: DevicesPhase;
  readonly reload: () => void;
  /** Connects a computer; `null` when the server could not be reached. */
  readonly create: (name: string) => Promise<NewDevice | null>;
  /** Disconnects a computer: its token stops working at once. */
  readonly revoke: (id: string) => Promise<boolean>;
};

const phaseOf = async (api: ApiClient): Promise<DevicesPhase> => {
  try {
    const { devices } = await api.call(endpoints.devices.list, {});
    return { devices, kind: "ready" };
  } catch {
    return { kind: "failed" };
  }
};

export const useDevices = (api: ApiClient): Devices => {
  const [phase, setPhase] = useState<DevicesPhase>({ kind: "loading" });
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    // Dropped on unmount, so a late answer never updates a screen that is gone.
    let isCurrent = true;
    const load = async (): Promise<void> => {
      const next = await phaseOf(api);
      if (isCurrent) {
        setPhase(next);
      }
    };
    void load();
    return () => {
      isCurrent = false;
    };
  }, [api, generation]);
  const reload = useCallback(() => {
    setGeneration((current) => current + 1);
  }, []);
  return {
    create: async (name) => {
      try {
        const created = await api.call(endpoints.devices.create, { body: { name } });
        reload();
        return created;
      } catch {
        return null;
      }
    },
    phase,
    reload,
    revoke: async (id) => {
      try {
        await api.call(endpoints.devices.revoke, { params: { id } });
        reload();
        return true;
      } catch {
        return false;
      }
    },
  };
};
