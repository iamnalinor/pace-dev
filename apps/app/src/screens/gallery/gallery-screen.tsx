import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import type { Language, MessageKey, ThemeName } from "@pace/core";

import { LanguageOverrideContext, useT } from "#app/app-state.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { ThemeProvider } from "#app/ui/theme-provider.tsx";
import { GALLERY_SETS, galleryData, type GallerySet } from "@pace/core/testing";

import { ChromeSections, TaskSections, TextSections, TimeSections } from "./gallery-sections.tsx";

const SET_LABEL: Readonly<Record<GallerySet, MessageKey>> = {
  demo: "dev.gallery.set.demo",
  empty: "dev.gallery.set.empty",
  one: "dev.gallery.set.one",
  worst: "dev.gallery.set.worst",
};

const THEMES: readonly ThemeName[] = ["light", "dark"];
const LANGUAGE_CHOICES: readonly Language[] = ["ru", "en"];

/** A row of radio chips that writes its choice to the URL (the gallery keeps its state there). */
const Choice = <T extends string>({
  choices,
  label,
  labelOf,
  param,
  selected,
}: {
  readonly choices: readonly T[];
  readonly label: MessageKey;
  readonly labelOf: (choice: T) => string;
  readonly param: "lang" | "set" | "theme";
  readonly selected: T;
}) => {
  const t = useT();
  const router = useRouter();
  return (
    <View
      accessibilityLabel={t(label)}
      className="flex-row flex-wrap items-center gap-2"
      role="radiogroup"
    >
      <Text className="font-sans text-subhead font-normal text-label-secondary">{t(label)}</Text>
      {choices.map((choice) => (
        <Chip
          key={choice}
          onPress={() => {
            router.setParams({ [param]: choice });
          }}
          selected={choice === selected}
        >
          {labelOf(choice)}
        </Chip>
      ))}
    </View>
  );
};

/**
The dev-only worst-case gallery: the kit's components fed from fixture view-models, so a layout
bug that needs a 300-character title, 37 subtasks or a 23 h 59 m block shows up on one screen
(and in `e2e/worst-case.e2e.ts`). Nothing here reads or writes the store. The route only loads
this file in a build made with EXPO_PUBLIC_DEV_LOGIN=1.
*/
const GalleryBody = ({
  language,
  set,
  theme,
}: {
  readonly language: Language;
  readonly set: GallerySet;
  readonly theme: ThemeName;
}) => {
  const t = useT();
  const data = galleryData(set, language);
  return (
    <Screen>
      {/* `dataSet` is react-native-web's way to a `data-*` attribute (the e2e reads `data-set`); React Native's types do not know it. */}
      <View testID="worst-case-gallery" {...({ dataSet: { set } } as object)}>
        <View className="gap-2 px-5 pt-6">
          <Text accessibilityRole="header" className="font-sans text-title2 text-label-primary">
            {t("dev.gallery.title")}
          </Text>
          <Choice
            choices={GALLERY_SETS}
            label="dev.gallery.data"
            labelOf={(choice) => t(SET_LABEL[choice])}
            param="set"
            selected={set}
          />
          <Choice
            choices={LANGUAGE_CHOICES}
            label="dev.gallery.language"
            labelOf={(choice) => t(`dev.gallery.language.${choice}`)}
            param="lang"
            selected={language}
          />
          <Choice
            choices={THEMES}
            label="dev.gallery.theme"
            labelOf={(choice) => t(`dev.gallery.theme.${choice}`)}
            param="theme"
            selected={theme}
          />
        </View>
        <TextSections data={data} />
        <TimeSections data={data} />
        <ChromeSections data={data} />
        <TaskSections data={data} />
      </View>
    </Screen>
  );
};

/** The gallery in the language and the theme its URL names, whatever the account says. */
export const GalleryScreen = (props: {
  readonly language: Language;
  readonly set: GallerySet;
  readonly theme: ThemeName;
}) => (
  <LanguageOverrideContext value={props.language}>
    <ThemeProvider forced={props.theme}>
      <GalleryBody {...props} />
    </ThemeProvider>
  </LanguageOverrideContext>
);
