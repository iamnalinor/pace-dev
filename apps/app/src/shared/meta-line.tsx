import { Fragment } from "react";
import { Text, View } from "react-native";

import type { MetaPart, NowRow } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { metaTexts, type MetaTone } from "#app/format/meta.ts";
import { ColorTag } from "#app/ui/color.tsx";
import { IMPORTANCE_COLORS, isBuiltInPreset } from "@pace/core";

import { useViewer } from "./use-viewer.ts";

const TONE: Readonly<Record<MetaTone, string>> = {
  plain: "",
  strong: "font-medium text-fg",
  warn: "text-warn",
};

/** The project's name, else the category's (a built-in one in the interface language). */
const rowTagLabel = (tag: NowRow["tag"], t: ReturnType<typeof useT>): string => {
  return tag.kind === "project" || !isBuiltInPreset(tag.presetId)
    ? tag.name
    : t(`preset.base.${tag.presetId}`);
};

/**
A row's meta line: the project (else the category) and the importance as coloured tags, then
`by end of day · 2 problems left` with lateness in orange.
*/
export const MetaLine = ({
  parts,
  tag,
}: {
  readonly parts: readonly MetaPart[];
  readonly tag: null | Pick<NowRow, "color" | "tag">;
}) => {
  const t = useT();
  const viewer = useViewer();
  const importances = parts.flatMap((part) => (part.kind === "importance" ? [part] : []));
  const rest = parts.filter((part) => part.kind !== "importance");
  const texts = metaTexts(rest, viewer);
  const tagLabel = tag === null ? null : rowTagLabel(tag.tag, t);
  return (
    <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
      {tag === null || tagLabel === null ? null : <ColorTag color={tag.color}>{tagLabel}</ColorTag>}
      {importances.map((part) => (
        <ColorTag color={IMPORTANCE_COLORS[part.importance]} key={part.importance}>
          {t(`importance.${part.importance}`)}
        </ColorTag>
      ))}
      {texts.length === 0 ? null : (
        <Text className="font-sans text-[12px] leading-4 text-muted">
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
