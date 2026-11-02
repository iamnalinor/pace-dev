import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useStore } from "zustand";

import { loadPushState, pushStore } from "#app/platform/notifications.ts";
import {
  type Permission,
  type PermissionId,
  permissionIdsFor,
  readPermissions,
  requestPermission,
} from "#app/platform/permissions.ts";

export type Permissions = {
  /** The permissions that apply to this phone now, in the order they are explained and asked. */
  readonly ids: readonly PermissionId[];
  /** `null` until the first read. */
  readonly list: null | readonly Permission[];
  readonly byId: (id: PermissionId) => Permission | undefined;
  readonly request: (permission: Permission) => Promise<void>;
};

/**
Where each permission stands, read again whenever the app comes back to the foreground: the
ones granted on an Android settings screen are only known then. Only those that apply with the
push method in use (`permissionIdsFor`), following it as it changes (a registration that lands
while the walk-through is open, a pick in Settings).
*/
export const usePermissions = (): Permissions => {
  const [read, setRead] = useState<null | readonly Permission[]>(null);
  const method = useStore(pushStore, (state) => state.method);
  const ids = permissionIdsFor({ method });
  const refresh = useCallback(() => {
    void (async () => {
      setRead(await readPermissions());
    })();
  }, []);
  useEffect(() => {
    refresh();
    // Before this start registered (or offline), the method it registered last.
    void loadPushState();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        refresh();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refresh]);
  const request = useCallback(
    async (permission: Permission) => {
      await requestPermission(permission);
      refresh();
    },
    [refresh],
  );
  const list = read?.filter((permission) => ids.includes(permission.id)) ?? null;
  return {
    byId: (id) => list?.find((permission) => permission.id === id),
    ids,
    list,
    request,
  };
};
