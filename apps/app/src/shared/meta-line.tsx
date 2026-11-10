import { Fragment } from "react";
import { Text as NativeText, View } from "react-native";

import type { MetaPart, NowRow } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { metaTexts, type MetaTone } from "#app/format/meta.ts";
import { cx } from "#app/ui/cx.ts";
import { Icon } from "#app/ui/icon.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { Tag } from "#app/ui/tag.tsx";
import { Text, type TextProps } from "#app/ui/text.tsx";
import { type Importance, type Language, presetLabel } from "@pace/core";

import { useViewer } from "./use-viewer.ts";

const TONE: Readonly<Record<MetaTone, string>> = {
  plain: "",
  strong: "font-medium text-label-primary",
  warn: "text-danger",
};

/** The project's name, else the category's (a default one in the interface language). */
const rowTagLabel = (tag: NowRow["tag"], language: Language): string =>
  tag.kind === "project" ? tag.name : presetLabel({ id: tag.presetId, name: tag.name }, language);

/** The importance as a word: the ramp is weight and ink, not colour (spec 4.3.2); Normal has no word. */
const IMPORTANCE_LOOK: Readonly<
  Record<
    Exclude<Importance, "normal">,
    { readonly className: string; readonly tone: TextProps["tone"] }
  >
> = {
  asap: { className: "font-semibold", tone: "danger" },
  nice_to_have: { className: "font-normal", tone: "secondary" },
  prioritized: { className: "font-semibold", tone: "primary" },
};

/**
The pieces in the order the line keeps them. A phone's line is cut at its end, so there the due
date, the longest and least urgent piece, goes after the rest: «Срок завтра 19:30 · осталос…» lost
the countdown, the one value that matters (design review 2 N10). A wide line keeps the reading
order, date first.
*/
const inCutOrder = (parts: readonly MetaPart[], isWide: boolean): readonly MetaPart[] =>
  isWide
    ? parts
    : [
        ...parts.filter((part) => part.kind !== "due"),
        ...parts.filter((part) => part.kind === "due"),
      ];

/** A small repeat mark: the row is one of a series (or a weekly homework). */
export const RepeatMark = () => {
  const t = useT();
  return (
    <View accessibilityLabel={t("meta.repeats")} accessible role="img">
      <Icon name="repeat" size="inline" />
    </View>
  );
};

/**
A row's meta line, one line (spec 4.3.2): the project (else the category) as a tag that yields
first (at most half the line), the importance word when it is not Normal, a repeat mark for a
series, then `by end of day · 2 subtasks left` in the footnote's tabular figures, ending in "…"
when it does not fit (on a phone the due date goes last, so it is what yields). Lateness is red.
*/
export const MetaLine = ({
  asOf,
  parts,
  showRepeat = true,
  tag,
}: {
  /** The moment "tomorrow" and "in 2 days" count from (History's); now by default. */
  readonly asOf?: string | undefined;
  readonly parts: readonly MetaPart[];
  /** Off where the row carries the mark itself (the task row's trailing slot). */
  readonly showRepeat?: boolean;
  readonly tag: null | Pick<NowRow, "color" | "tag">;
}) => {
  const t = useT();
  const current = useViewer();
  const viewer = asOf === undefined ? current : { ...current, now: asOf };
  const importances = parts
    .filter((part) => part.kind === "importance")
    .map((part) => part.importance)
    .filter((importance) => importance !== "normal");
  const isRepeating = showRepeat && parts.some((part) => part.kind === "repeats");
  const isWide = useIsWide();
  const rest = inCutOrder(
    parts.filter((part) => part.kind !== "importance" && part.kind !== "repeats"),
    isWide,
  );
  const texts = metaTexts(rest, viewer);
  const tagLabel = tag === null ? null : rowTagLabel(tag.tag, viewer.language);
  return (
    <View className="flex-row items-center gap-x-2">
      {tag === null || tagLabel === null ? null : (
        <View className="max-w-1/2 shrink-0">
          <Tag hue={tag.color}>{tagLabel}</Tag>
        </View>
      )}
      {importances.map((importance) => (
        <Text
          className={cx("shrink-0", IMPORTANCE_LOOK[importance].className)}
          key={importance}
          role="footnote"
          tone={IMPORTANCE_LOOK[importance].tone}
        >
          {t(`importance.${importance}`)}
        </Text>
      ))}
      {isRepeating ? <RepeatMark /> : null}
      {texts.length === 0 ? null : (
        <Text
          full={texts.map((piece) => piece.text).join(" · ")}
          numeric
          policy="truncate"
          role="footnote"
          tone="secondary"
        >
          {texts.map((piece, index) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- positional pieces without ids; a text can repeat
            <Fragment key={index}>
              {index === 0 ? null : " · "}
              <NativeText className={TONE[piece.tone]}>{piece.text}</NativeText>
            </Fragment>
          ))}
        </Text>
      )}
    </View>
  );
};
