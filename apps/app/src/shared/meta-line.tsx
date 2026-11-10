import { Fragment } from "react";
import { Text as NativeText, View } from "react-native";

import type { MetaPart, NowRow } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { metaTexts, type MetaTone } from "#app/format/meta.ts";
import { Icon } from "#app/ui/icon.tsx";
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
A piece's own spaces do not break (no-break spaces): the line wraps between pieces, at « · », so
«осталось 2 дн 23 ч» is read whole on one line or the next. The one break left inside a piece is
before a clock time: a date too long for a 320 line went «Due Nov 21 00:4 / 0» when nothing in it
could break, and now goes «Due Nov 21 / 00:40».
*/
const unbroken = (text: string): string => text.replaceAll(/ (?!\d{1,2}:\d{2})/gu, "\u{A0}");

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
A row's meta line (spec 4.3.2): the project (else the category) as a tag that yields first (at
most half the line), the importance word when it is not Normal, a repeat mark for a series, then
`Due tomorrow 19:30 · 1d left · 4/7 done` in the footnote's tabular figures. The order is the
same at every width, and a line too long for a phone wraps between its pieces onto a second line
(at most two, then "…"): the phone's own order once put the date last and its cut ate the deadline
(QA PR55-1-04, bug-lessons 341). Lateness is red.
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
  const rest = parts.filter((part) => part.kind !== "importance" && part.kind !== "repeats");
  const texts = metaTexts(rest, viewer);
  const tagLabel = tag === null ? null : rowTagLabel(tag.tag, viewer.language);
  return (
    // Leading-aligned: a second line of pieces starts under the first, the tag stays on the first.
    <View className="flex-row items-start gap-x-2">
      {tag === null || tagLabel === null ? null : (
        <View className="max-w-1/2 shrink-0">
          <Tag hue={tag.color}>{tagLabel}</Tag>
        </View>
      )}
      {importances.map((importance) => (
        <View className="min-h-5 shrink-0 justify-center" key={importance}>
          <Text
            className={IMPORTANCE_LOOK[importance].className}
            role="footnote"
            tone={IMPORTANCE_LOOK[importance].tone}
          >
            {t(`importance.${importance}`)}
          </Text>
        </View>
      ))}
      {isRepeating ? (
        <View className="min-h-5 justify-center">
          <RepeatMark />
        </View>
      ) : null}
      {texts.length === 0 ? null : (
        // The first line sits on the tag's centre line (a tag is 20, a footnote line 18).
        <View className="min-h-5 min-w-0 shrink justify-center">
          <Text
            full={texts.map((piece) => piece.text).join(" · ")}
            lines={2}
            numeric
            policy="clamp"
            role="footnote"
            tone="secondary"
          >
            {texts.map((piece, index) => (
              // eslint-disable-next-line @eslint-react/no-array-index-key -- positional pieces without ids; a text can repeat
              <Fragment key={index}>
                {index === 0 ? null : " · "}
                <NativeText className={TONE[piece.tone]}>{unbroken(piece.text)}</NativeText>
              </Fragment>
            ))}
          </Text>
        </View>
      )}
    </View>
  );
};
