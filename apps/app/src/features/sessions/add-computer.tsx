import { useEffect, useRef, useState } from "react";
import { type TextInput, View } from "react-native";

import type { NewAgent } from "@pace/client/react";

import { useT } from "#app/app-state.tsx";
import { focusField } from "#app/platform/focus-field.ts";
import { Button } from "#app/ui/button.tsx";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { Sheet } from "#app/ui/sheet.tsx";
import { TextField } from "#app/ui/text-field.tsx";

import { ComputerSteps } from "./computer-steps.tsx";

/** How often, and how many times, the name field asks for focus as the sheet opens. */
const FOCUS_RETRY_MS = 50;
const FOCUS_TRIES = 10;

/**
"Add a computer": a name, then a token of its own (it may only upload app usage) inside one
command per system that installs Pace's desktop agent there.
*/
export const AddComputer = ({
  create,
  onClose,
}: {
  readonly create: (name: string) => Promise<NewAgent>;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const [name, setName] = useState(() => t("devices.defaultName"));
  const [created, setCreated] = useState<NewAgent | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  // Enter and the button may land in one batch: one token (bug class 36).
  const sendingRef = useRef(false);
  const nameRef = useRef<TextInput>(null);
  // Not `autoFocus`: on the web the sheet gives focus to its dialog as it opens, after the field
  // took it, and the dialog may still be hidden a moment. Asked again until it takes, briefly.
  useEffect(() => {
    const tries = { left: FOCUS_TRIES };
    const timer = setInterval(() => {
      tries.left -= 1;
      if (nameRef.current?.isFocused() === true || tries.left < 0) {
        clearInterval(timer);
        return;
      }
      focusField(nameRef.current);
    }, FOCUS_RETRY_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const submit = async (): Promise<void> => {
    if (sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    setIsBusy(true);
    try {
      setCreated(await create(name.trim() === "" ? t("devices.defaultName") : name.trim()));
      setHasFailed(false);
    } catch {
      setHasFailed(true);
    } finally {
      sendingRef.current = false;
      setIsBusy(false);
    }
  };
  return (
    <Sheet closeLabel={t("common.close")} onClose={onClose} title={t("devices.add")} visible>
      {created === null ? (
        <View className="gap-3">
          {/* The name is the sheet's one question: focused, the suggestion selected to type over. */}
          <TextField
            autoComplete="off"
            autoCorrect={false}
            enterKeyHint="done"
            error={hasFailed ? t("devices.createFailed") : null}
            label={t("devices.name")}
            maxLength={80}
            onChangeText={setName}
            onSubmitEditing={() => void submit()}
            ref={nameRef}
            returnKeyType="done"
            selectTextOnFocus
            spellCheck={false}
            value={name}
          />
          {/* The field takes Enter itself; the button shows it, as other forms' do. */}
          <Button
            busy={isBusy}
            hotkey={HOTKEYS.enter}
            hotkeyMode="hint"
            onPress={() => void submit()}
          >
            {t("devices.create")}
          </Button>
        </View>
      ) : (
        <ComputerSteps device={created} onDone={onClose} />
      )}
    </Sheet>
  );
};
