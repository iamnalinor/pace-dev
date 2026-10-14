import { useState } from "react";
import { View } from "react-native";

import type { NewDevice } from "@pace/client/react";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { TextField } from "#app/ui/text-field.tsx";

import { ComputerSteps } from "./computer-steps.tsx";

/**
"Add a computer": a name, then a token of its own (it may only upload app usage) inside one
command per system that installs Pace's desktop agent there.
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
        <ComputerSteps device={created} onDone={onClose} />
      )}
    </Sheet>
  );
};
