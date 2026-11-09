import { useState } from "react";
import { View } from "react-native";

import type { Drawn, Fold } from "@pace/client";
import type { Language } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { cx } from "#app/ui/cx.ts";
import { inkClass, tintClass } from "#app/ui/hue.ts";
import { Pressable } from "#app/ui/pressable.tsx";
import { Text } from "#app/ui/text.tsx";
import { Tooltip } from "#app/ui/tooltip.tsx";

import { boxLabelFit } from "./box-label.ts";
import { laneStyle } from "./week-lanes.ts";
import { type Picked, pickedKey, type Single } from "./week-picked.ts";

/** "Mon, Oct 5": the day as a screen reader reads it before the hours (F-A11Y-09). */
const dayFull = (at: string, zone: string, language: Language): string =>
  new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    timeZone: zone,
    weekday: "short",
  }).format(new Date(at));

/** A block or an event is at least this tall: a two-minute one is still something to tap. */
export const MIN_TARGET_PX = 24;

/**
On the web a word never breaks inside itself (react-native-web's text breaks a word that does not
fit, «Музы|ка»; design review H6): `boxLabelFit` cuts the name to one line instead.
*/
const KEEP_WORDS = { overflowWrap: "normal", wordBreak: "normal" } as const;

/** A label line's height: a box shows as many lines of its name as fit whole (F-TYP-05). */
const LABEL_LINE_PX = 16;

/** The time a block or an event spans. */
const stretchOf = (item: Single): { readonly startAt: string; readonly endAt: string } =>
  item.kind === "event" ? item.event : item.block;

export const pickOf = (item: Single): Picked => item;

/** How an item looks: events outlined, blocks ink on their hue's tint; the picked one ringed. */
const itemLook = (
  item: Single,
  isSelected: boolean,
): { readonly box: string; readonly text: string } => {
  if (item.kind === "block") {
    return {
      box: cx(tintClass(item.block.color), isSelected && "border-2 border-accent"),
      text: cx("font-medium", inkClass(item.block.color)),
    };
  }
  return isSelected
    ? { box: "border-2 border-accent bg-accent-quiet", text: "text-accent-text" }
    : { box: "border border-dashed border-hue-slate-ink", text: "text-label-secondary" };
};

export type PlaceProps = {
  readonly onPick: (picked: Picked) => void;
  readonly selectedKey: null | string;
  readonly language: Language;
  readonly zone: string;
};

/** The day, the hours and the name: what a screen reader says for a box (F-A11Y-09). */
const useBoxName = (item: Single, { language, zone }: Pick<PlaceProps, "language" | "zone">) => {
  const t = useT();
  const stretch = item.kind === "event" ? item.event : item.block;
  const label = item.kind === "event" ? item.event.title : item.block.label;
  const times = `${clockTime(stretch.startAt, zone)}–${clockTime(stretch.endAt, zone)}`;
  const day = dayFull(stretch.startAt, zone, language);
  const what = item.kind === "event" ? `${t("week.calendarEvent")}: ${label}` : label;
  return { label, named: `${day}, ${times}, ${what}`, tip: `${label}, ${times}` };
};

/** One block or event on its column, in its lane; a tap picks it. */
export const ItemBox = ({
  entry,
  onPick,
  selectedKey,
  ...place
}: PlaceProps & { readonly entry: Drawn<Single> }) => {
  const { item } = entry;
  const picked = pickOf(item);
  const isSelected = pickedKey(picked) === selectedKey;
  const look = itemLook(item, isSelected);
  const { label, named, tip } = useBoxName(item, place);
  const lines = Math.max(1, Math.floor(entry.height / LABEL_LINE_PX));
  const [width, setWidth] = useState(0);
  const fit = boxLabelFit(label, width, lines);
  return (
    <View
      className="absolute"
      style={{ ...laneStyle(entry), height: entry.height, top: entry.top }}
    >
      {/* The whole name and the times on hover and keyboard focus: a narrow lane shows a letter or two
      of the name (QA round 18 L7); a tap opens the details anyway. */}
      <Tooltip isFilling label={tip}>
        <Pressable
          aria-current={isSelected ? "true" : undefined}
          className={cx("flex-1 overflow-hidden rounded-xs px-1", look.box)}
          // The box is as tall as the time it spans (at least 24): the target is what is drawn.
          hitArea="drawn"
          label={named}
          onLayout={(event) => {
            setWidth(event.nativeEvent.layout.width);
          }}
          onPress={() => {
            onPick(picked);
          }}
          role="button"
        >
          <Text
            className={look.text}
            role="caption"
            {...fit}
            // react-native-web's styles React Native's types do not know.
            {...({ style: KEEP_WORDS } as object)}
          >
            {label}
          </Text>
        </Pressable>
      </Tooltip>
    </View>
  );
};

/** A run too crowded to draw lane by lane: one «+N» block over it that opens the list. */
export const FoldBox = ({
  fold,
  onPick,
  selectedKey,
  ...place
}: PlaceProps & { readonly fold: Fold<Single> }) => {
  const t = useT();
  const picked: Picked = { items: fold.items, kind: "group" };
  const first = fold.items[0];
  const firstStretch = first === undefined ? undefined : stretchOf(first);
  const day =
    firstStretch === undefined ? "" : dayFull(firstStretch.startAt, place.zone, place.language);
  const count = fold.items.length;
  return (
    <View className="absolute left-0 right-0" style={{ height: fold.height, top: fold.top }}>
      <Pressable
        aria-current={pickedKey(picked) === selectedKey ? "true" : undefined}
        className="flex-1 items-center justify-center rounded-xs border border-outline bg-fill-3"
        hitArea="drawn"
        label={t("week.folded", { count, day })}
        onPress={() => {
          onPick(picked);
        }}
        role="button"
      >
        <Text numeric role="caption">{`+${String(count)}`}</Text>
      </Pressable>
    </View>
  );
};
