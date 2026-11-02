import { Repeat } from "lucide-react-native";
import { Fragment } from "react";
import { Text, View } from "react-native";

import type { MetaPart, NowRow } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { metaTexts, type MetaTone } from "#app/format/meta.ts";
import { ColorTag, IMPORTANCE_HUES } from "#app/ui/color.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { type Language, presetLabel } from "@pace/core";

import { useViewer } from "./use-viewer.ts";

const TONE: Readonly<Record<MetaTone, string>> = {
  plain: "",
  strong: "font-medium text-label-primary",
  warn: "text-danger",
};

/** The project's name, else the category's (a default one in the interface language). */
const rowTagLabel = (tag: NowRow["tag"], language: Language): string =>
  tag.kind === "project" ? tag.name : presetLabel({ id: tag.presetId, name: tag.name }, language);

/** A small repeat mark: the row is one of a series (or a weekly homework). */
const RepeatMark = () => {
  const t = useT();
  const { palette } = useTheme();
  return (
    <View accessibilityLabel={t("meta.repeats")} accessible role="img">
      <Repeat color={palette["label.secondary"]} size={13} strokeWidth={2.25} />
    </View>
  );
};

/**
A row's meta line: the project (else the category) and the importance as coloured tags, a repeat
mark for a series, then `by end of day · 2 subtasks left` with lateness in orange.
*/
export const MetaLine = ({
  asOf,
  parts,
  tag,
}: {
  /** The moment "tomorrow" and "in 2 days" count from (History's); now by default. */
  readonly asOf?: string | undefined;
  readonly parts: readonly MetaPart[];
  readonly tag: null | Pick<NowRow, "color" | "tag">;
}) => {
  const t = useT();
  const current = useViewer();
  const viewer = asOf === undefined ? current : { ...current, now: asOf };
  const importances = parts.flatMap((part) => (part.kind === "importance" ? [part] : []));
  const isRepeating = parts.some((part) => part.kind === "repeats");
  const rest = parts.filter((part) => part.kind !== "importance" && part.kind !== "repeats");
  const texts = metaTexts(rest, viewer);
  const tagLabel = tag === null ? null : rowTagLabel(tag.tag, viewer.language);
  return (
    <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
      {tag === null || tagLabel === null ? null : <ColorTag color={tag.color}>{tagLabel}</ColorTag>}
      {importances.map((part) => (
        <ColorTag color={IMPORTANCE_HUES[part.importance]} key={part.importance}>
          {t(`importance.${part.importance}`)}
        </ColorTag>
      ))}
      {isRepeating ? <RepeatMark /> : null}
      {texts.length === 0 ? null : (
        <Text className="font-sans text-caption font-normal text-label-tertiary">
          {texts.map((piece, index) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- positional pieces without ids; a text can repeat
            <Fragment key={index}>
              {index === 0 ? null : " · "}
              <Text className={TONE[piece.tone]}>{piece.text}</Text>
            </Fragment>
          ))}
        </Text>
      )}
    </View>
  );
};
