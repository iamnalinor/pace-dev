import { useState } from "react";
import { Text, View } from "react-native";

import type { NewAgent } from "@pace/client/react";

import { useT } from "#app/app-state.tsx";
import { browserComputerOs } from "#app/platform/computer-os.ts";
import { useServerInfo } from "#app/platform/server-store.ts";
import { SHARE_LABEL_KEY, shareText } from "#app/platform/share-text.ts";
import { Button } from "#app/ui/button.tsx";
import { agentCommand, agentLogsCommand, type ComputerOs, LINUX_PACKAGES } from "@pace/client";

import { OsPicker } from "./os-picker.tsx";

const STEP = "font-sans text-[14px] leading-[20px] text-fg";
const NOTE = "font-sans text-[12px] leading-[17px] text-muted";

const tokenShareLabel = (isShared: boolean) => {
  if (SHARE_LABEL_KEY !== "devices.copy") {
    return "devices.shareToken";
  }
  return isShared ? "devices.copied" : "devices.copyToken";
};

/** A command to paste: selectable, and read out whole. */
const Code = ({ children, testID }: { readonly children: string; readonly testID?: string }) => (
  <Text
    accessibilityLabel={children}
    className="rounded-lg border border-line bg-raised p-3 font-sans text-[12px] leading-[18px] text-fg"
    selectable
    testID={testID}
  >
    {children}
  </Text>
);

/**
After the token is made: the computer's system (preselected from the browser on a computer),
then that system's steps around the install command and its separate one-time token.
Self-contained, so it can sit in a sheet or inline in Settings.
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
          <Code>{LINUX_PACKAGES.join("\n")}</Code>
        </>
      )}
      <Text className={STEP}>{t(os === "windows" ? "devices.step2Windows" : "devices.step2")}</Text>
      <Code>{command}</Code>
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
      <Code testID="device-setup-token">{device.token}</Code>
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
      <Code>{agentLogsCommand(os)}</Code>
      {os === "linux" && <Text className={NOTE}>{t("devices.waylandGnome")}</Text>}
      <Text className={NOTE}>{t("devices.checkList")}</Text>
      <Button onPress={onDone} variant="secondary">
        {t("devices.done")}
      </Button>
    </View>
  );
};
