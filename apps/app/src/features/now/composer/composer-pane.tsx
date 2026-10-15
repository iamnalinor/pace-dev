import { ScrollView, View } from "react-native";

import { ComposerFlowForm } from "./composer.tsx";

/** The task form in Now's right pane on a computer, in place of the picked task. */
export const ComposerPane = () => (
  <ScrollView
    className="flex-1 bg-bg"
    contentContainerClassName="px-6 pb-24 pt-5"
    keyboardShouldPersistTaps="handled"
  >
    <View className="w-full max-w-[640px] self-center">
      <ComposerFlowForm variant="pane" />
    </View>
  </ScrollView>
);
