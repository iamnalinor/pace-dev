import { useState } from "react";
import { Linking, Text, View } from "react-native";

import type { NewDevice } from "@pace/client/react";

import { useT } from "#app/app-state.tsx";
import { API_BASE_URL, WEB_ORIGIN } from "#app/platform/api-base.ts";
import { SHARE_LABEL_KEY, shareText } from "#app/platform/share-text.ts";
import { Button } from "#app/ui/button.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { bridgeCommand } from "@pace/client";

const ACTIVITY_WATCH_URL = "https://activitywatch.net/downloads/";

/** After the token is made: the three steps, the command, and a way to get it to the computer. */
const Steps = ({ device, onDone }: { readonly device: NewDevice; readonly onDone: () => void }) => {
  const t = useT();
  const [isShared, setIsShared] = useState(false);
  const command = bridgeCommand({ apiBase: API_BASE_URL, device, webOrigin: WEB_ORIGIN });
  return (
    <View className="gap-3">
      <Text className="font-sans text-[14px] leading-[20px] text-fg">{t("devices.step1")}</Text>
      <Button
        onPress={() => {
          void Linking.openURL(ACTIVITY_WATCH_URL);
        }}
        variant="secondary"
      >
        {t("devices.openActivityWatch")}
      </Button>
      <Text className="font-sans text-[14px] leading-[20px] text-fg">{t("devices.step2")}</Text>
      <Text
        accessibilityLabel={command}
        className="rounded-lg border border-line bg-raised p-3 font-sans text-[12px] leading-[18px] text-fg"
        selectable
      >
        {command}
      </Text>
      <Button
        onPress={() => {
          void (async () => {
            setIsShared((await shareText(command)) === "done");
          })();
        }}
      >
        {t(isShared && SHARE_LABEL_KEY === "devices.copy" ? "devices.copied" : SHARE_LABEL_KEY)}
      </Button>
      <Text className="font-sans text-[13px] leading-[18px] text-warn">
        {t("devices.tokenOnce")}
      </Text>
      <Text className="font-sans text-[14px] leading-[20px] text-fg">{t("devices.step3")}</Text>
      <Text className="font-sans text-[12px] leading-[17px] text-muted">
        {t("devices.otherSystems")}
      </Text>
      <Button onPress={onDone} variant="secondary">
        {t("devices.done")}
      </Button>
    </View>
  );
};

/**
"Add a computer": a name, then a token of its own (it may only upload app usage) inside one
command that installs the desktop bridge there.
*/
export const AddComputer = ({
  create,
  onClose,
}: {
  readonly create: (name: string) => Promise<NewDevice | null>;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const [name, setName] = useState(() => t("devices.defaultName"));
  const [created, setCreated] = useState<NewDevice | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const submit = async (): Promise<void> => {
    setIsBusy(true);
    const device = await create(name.trim() === "" ? t("devices.defaultName") : name.trim());
    setIsBusy(false);
    setHasFailed(device === null);
    setCreated(device);
  };
  return (
    <Sheet closeLabel={t("common.close")} onClose={onClose} title={t("devices.add")} visible>
      {created === null ? (
        <View className="gap-3">
          <TextField
            error={hasFailed ? t("devices.createFailed") : null}
            label={t("devices.name")}
            maxLength={80}
            onChangeText={setName}
            value={name}
          />
          <Button busy={isBusy} onPress={() => void submit()}>
            {t("devices.create")}
          </Button>
        </View>
      ) : (
        <Steps device={created} onDone={onClose} />
      )}
    </Sheet>
  );
};
