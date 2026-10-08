import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

import {
  type Permission,
  type PermissionId,
  readPermissions,
  requestPermission,
} from "#app/platform/permissions.ts";

export type Permissions = {
  /** `null` until the first read. */
  readonly list: null | readonly Permission[];
  readonly byId: (id: PermissionId) => Permission | undefined;
  readonly request: (permission: Permission) => Promise<void>;
};

/**
Where each permission stands, read again whenever the app comes back to the foreground: the
ones granted on an Android settings screen are only known then.
*/
export const usePermissions = (): Permissions => {
  const [list, setList] = useState<null | readonly Permission[]>(null);
  const refresh = useCallback(() => {
    void (async () => {
      setList(await readPermissions());
    })();
  }, []);
  useEffect(() => {
    refresh();
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
  return {
    byId: (id) => list?.find((permission) => permission.id === id),
    list,
    request,
  };
};
