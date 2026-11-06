import { useState } from "react";
import { View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { Disclosure } from "#app/ui/disclosure.tsx";
import { Text } from "#app/ui/text.tsx";

/** The text the task came from, verbatim, in a disclosure that exists only for an assistant's reading. */
export const SourceText = ({ text }: { readonly text: null | string }) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  if (text === null) {
    return null;
  }
  return (
    <Disclosure
      label={t("task.source")}
      onToggle={() => {
        setIsOpen((open) => !open);
      }}
      open={isOpen}
    >
      <View className="mx-gutter mt-2 rounded-md bg-inset p-3">
        <Text role="callout" selectable>
          {text}
        </Text>
      </View>
    </Disclosure>
  );
};
