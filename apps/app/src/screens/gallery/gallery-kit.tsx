import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { Pressable } from "#app/ui/pressable.tsx";

const NOTHING = (): void => undefined;

const BOX = "min-h-12 justify-center rounded-md bg-cell px-4 py-2";
const LABEL = "font-sans text-callout font-medium text-label-primary";

/**
The kit's state layer (`ui/pressable.tsx`) in each of its states, in the gallery's language: hover,
press and the focus ring are tried by hand on it (web), the ripple on a phone. Its labels are the
longest a control of the kit carries here, in Russian.
*/
export const KitSections = () => {
  const t = useT();
  return (
    <View className="gap-2 px-5 pt-6">
      <Text accessibilityRole="header" className="font-sans text-headline text-label-primary">
        {t("dev.gallery.section.pressable")}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Pressable className={BOX} onPress={NOTHING} role="button">
          <Text className={LABEL}>{t("dev.gallery.pressable.rest")}</Text>
        </Pressable>
        <Pressable className={BOX} disabled onPress={NOTHING} role="button">
          <Text className={LABEL}>{t("dev.gallery.pressable.disabled")}</Text>
        </Pressable>
        <Pressable className={BOX} onPress={NOTHING} ripple="borderless" role="button">
          <Text className={LABEL}>{t("dev.gallery.pressable.borderless")}</Text>
        </Pressable>
      </View>
      <View
        aria-label={t("dev.gallery.section.pressable")}
        className="flex-row flex-wrap gap-2"
        role="tablist"
      >
        <Pressable className={BOX} onPress={NOTHING} role="tab" selected>
          <Text className={LABEL}>{t("dev.gallery.pressable.selected")}</Text>
        </Pressable>
        <Pressable className={BOX} onPress={NOTHING} role="tab" selected={false}>
          <Text className={LABEL}>{t("dev.gallery.pressable.unselected")}</Text>
        </Pressable>
      </View>
    </View>
  );
};
