import { useState } from "react";
import { Text, View } from "react-native";

import type { NewAgent } from "@pace/client/react";

import { useT } from "#app/app-state.tsx";
import { browserComputerOs } from "#app/platform/computer-os.ts";
import { useServerInfo } from "#app/platform/server-store.ts";
import { SHARE_LABEL_KEY, shareText } from "#app/platform/share-text.ts";
import { Button } from "#app/ui/button.tsx";
import { agentCommand, agentLogsCommand, type ComputerOs, LINUX_PACKAGES } from "@pace/client";

import { CodeText } from "./code-text.tsx";
import { OsPicker } from "./os-picker.tsx";

const STEP = "font-sans text-[14px] leading-[20px] text-fg";
const NOTE = "font-sans text-[12px] leading-[17px] text-muted";

const tokenShareLabel = (isShared: boolean) => {
  if (SHARE_LABEL_KEY !== "devices.copy") {
    return "devices.shareToken";
  }
  return isShared ? "devices.copied" : "devices.copyToken";
};

/**
After the token is made: the computer's system (preselected from the browser on a computer),
then that system's steps around the install command and its separate one-time token.
Self-contained, so it can sit in a sheet or inline in Settings. The commands name the current
server (`useServerInfo()`), not the build's.
*/
export const ComputerSteps = ({
  device,
  onDone,
}: {
  readonly device: NewAgent;
  readonly onDone: () => void;
}) => {
  const t = useT();
  const [os, setOs] = useState<ComputerOs>(() => browserComputerOs() ?? "windows");
  const [isShared, setIsShared] = useState(false);
  const [isTokenShared, setIsTokenShared] = useState(false);
  const { apiOrigin, webOrigin } = useServerInfo();
  const command = agentCommand({ apiBase: apiOrigin, device, os, webOrigin });
  return (
    <View className="gap-3">
      <OsPicker
        onChange={(next) => {
          setOs(next);
          setIsShared(false);
        }}
        value={os}
      />
      {os === "windows" && <Text className={STEP}>{t("devices.step1Windows")}</Text>}
      {os === "macos" && <Text className={STEP}>{t("devices.step1Macos")}</Text>}
      {os === "linux" && (
        <>
          <Text className={STEP}>{t("devices.step1Linux")}</Text>
          <Text className={NOTE}>{t("devices.linuxPackages")}</Text>
          <CodeText>{LINUX_PACKAGES.join("\n")}</CodeText>
        </>
      )}
      <Text className={STEP}>{t(os === "windows" ? "devices.step2Windows" : "devices.step2")}</Text>
      <CodeText>{command}</CodeText>
      <Button
        onPress={() => {
          void (async () => {
            setIsShared((await shareText(command)) === "done");
          })();
        }}
      >
        {t(isShared && SHARE_LABEL_KEY === "devices.copy" ? "devices.copied" : SHARE_LABEL_KEY)}
      </Button>
      {os === "macos" && <Text className={NOTE}>{t("devices.macPython")}</Text>}
      <Text className={STEP}>{t("devices.tokenPrompt")}</Text>
      <CodeText testID="device-setup-token">{device.token}</CodeText>
      <Button
        onPress={() => {
          void (async () => {
            setIsTokenShared((await shareText(device.token)) === "done");
          })();
        }}
        variant="secondary"
      >
        {t(tokenShareLabel(isTokenShared))}
      </Button>
      <Text className="font-sans text-[13px] leading-[18px] text-warn">
        {t("devices.tokenOnce")}
      </Text>
      <Text className={STEP}>{t("devices.step3")}</Text>
      <Text className={STEP}>{t("devices.step4")}</Text>
      <CodeText>{agentLogsCommand(os)}</CodeText>
      {os === "linux" && <Text className={NOTE}>{t("devices.waylandGnome")}</Text>}
      <Text className={NOTE}>{t("devices.checkList")}</Text>
      <Button onPress={onDone} variant="secondary">
        {t("devices.done")}
      </Button>
    </View>
  );
};
