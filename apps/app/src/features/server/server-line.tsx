import { useState } from "react";
import { Text } from "react-native";
import { useStore } from "zustand";

import { useT } from "#app/app-state.tsx";
import { serverHost, serverStore } from "#app/platform/server-store.ts";
import { OverlayPresence } from "#app/ui/overlay-presence.tsx";
import { Pressable } from "#app/ui/pressable.tsx";

import { ChangeServerSheet } from "./change-server-sheet.tsx";

/**
The quiet "Server: host · Change" under the phone's sign-in: which server this app signs in on,
and the way to another one (Android only: the web build is tied to its own deployment).
*/
export const ServerLine = () => {
  const t = useT();
  const host = serverHost(useStore(serverStore, (state) => state.origin));
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Pressable
        className="min-h-hit-web items-center justify-center self-center px-3"
        label={t("server.changeLabel", { host })}
        onPress={() => {
          setIsOpen(true);
        }}
        role="button"
      >
        <Text className="text-center font-sans text-footnote text-label-secondary">
          {t("server.line", { host })}
          {" · "}
          <Text className="font-medium text-accent-text">{t("server.change")}</Text>
        </Text>
      </Pressable>
      <OverlayPresence value={isOpen ? true : null}>
        {() => (
          <ChangeServerSheet
            onClose={() => {
              setIsOpen(false);
            }}
          />
        )}
      </OverlayPresence>
    </>
  );
};
