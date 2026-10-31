import { useState } from "react";
import { Pressable, Text } from "react-native";
import { useStore } from "zustand";

import { useT } from "#app/app-state.tsx";
import { serverHost, serverStore } from "#app/platform/server-store.ts";

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
        accessibilityLabel={t("server.changeLabel", { host })}
        accessibilityRole="button"
        className="min-h-11 items-center justify-center self-center px-3 active:opacity-70"
        onPress={() => {
          setIsOpen(true);
        }}
      >
        <Text className="text-center font-sans text-[13px] text-muted">
          {t("server.line", { host })}
          {" · "}
          <Text className="font-medium text-accentQuietText">{t("server.change")}</Text>
        </Text>
      </Pressable>
      {isOpen ? (
        <ChangeServerSheet
          onClose={() => {
            setIsOpen(false);
          }}
        />
      ) : null}
    </>
  );
};
