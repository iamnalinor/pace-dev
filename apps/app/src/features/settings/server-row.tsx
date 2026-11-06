import { useStore } from "zustand";

import { useT } from "#app/app-state.tsx";
import { serverHost, serverStore } from "#app/platform/server-store.ts";
import { ListRow } from "#app/ui/list-row.tsx";
import { Text } from "#app/ui/text.tsx";

import { middleEllipsis } from "./middle-ellipsis.ts";

/** The longest host shown whole; a longer one keeps its start and its end (F-DAT-11). */
const HOST_LENGTH = 28;

/** Which server this app is on, read-only here (it is changed on the sign-in screen). */
export const ServerRow = () => {
  const t = useT();
  const host = serverHost(useStore(serverStore, (state) => state.origin));
  return (
    <ListRow
      subtitle={t("settings.server.hint")}
      title={t("settings.server")}
      trailing={
        <Text role="body" tone="secondary">
          {middleEllipsis(host, HOST_LENGTH)}
        </Text>
      }
    />
  );
};
