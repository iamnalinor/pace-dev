import { CircleHelp } from "lucide-react-native";
import { useState } from "react";
import { Text } from "react-native";

import type { MessageKey } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { Sheet } from "#app/ui/sheet.tsx";

const PARAGRAPHS: readonly MessageKey[] = [
  "now.help.score",
  "now.help.waiting",
  "now.help.later",
  "now.help.paused",
  "now.help.why",
];

/** "?" beside the header: what the order means, and where waiting and later tasks are. */
export const NowHelp = () => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const close = (): void => {
    setIsOpen(false);
  };
  return (
    <>
      <IconButton
        icon={CircleHelp}
        label={t("now.help.title")}
        onPress={() => {
          setIsOpen(true);
        }}
      />
      <Sheet
        closeLabel={t("common.close")}
        onClose={close}
        title={t("now.help.title")}
        visible={isOpen}
      >
        {PARAGRAPHS.map((key) => (
          <Text className="font-sans text-[15px] leading-6 text-fg2" key={key}>
            {t(key)}
          </Text>
        ))}
      </Sheet>
    </>
  );
};
