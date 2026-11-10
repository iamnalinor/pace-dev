import { ActivityIndicator } from "react-native";

import type { HapticKind } from "../platform/haptics.ts";

import { BadgeAnchor, type CountTone } from "./count-badge.tsx";
import { cx } from "./cx.ts";
import { Icon, type IconName, type IconSize } from "./icon.tsx";
import { Pressable } from "./pressable.tsx";
import { useTheme } from "./theme-provider.tsx";
import { Tooltip } from "./tooltip.tsx";

/** The glyph in `label.primary` (`label.quaternary` disabled), or a spinner while busy. */
const Glyph = ({
  busy,
  disabled,
  icon,
  isFilled,
  size,
}: {
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly icon: IconName;
  readonly isFilled: boolean;
  readonly size: IconSize;
}) => {
  const { palette } = useTheme();
  return busy ? (
    <ActivityIndicator aria-hidden color={palette["label.secondary"]} size="small" />
  ) : (
    <Icon filled={isFilled} name={icon} size={size} tone={disabled ? "quaternary" : "primary"} />
  );
};

/** A toggle's `aria-pressed`, and a tonal button's disc. */
const toggleOrDisc = (selected: boolean | undefined, isTonal: boolean) => ({
  ...(isTonal && { visual: "size-8 bg-fill-2" }),
  ...(selected !== undefined && { "aria-pressed": selected }),
});

/**
An icon action (spec §4.2.11) on the kit's Pressable: the whole 48 dp / 44 px target is the round
control (`radius.pill`, a borderless ripple on Android, a round overlay and ring on the web), the
glyph in `label.primary` (the icon is its only label). `selected` (a toggle, Week's night hours)
puts a `fill.3` disc under it and says `aria-pressed`; `busy` swaps the glyph for a spinner and
blocks presses; disabled draws the glyph in `label.quaternary`, never an opacity. With no visible
name it names itself in a tooltip on hover and keyboard focus (QA round 17 M7). `badge` hangs a
count off the glyph's top-right corner, growing away from it (F-DAT-10, R23-13b). `tonal` draws a
32 `fill.2` disc inside the target (the look of a `secondary` Button without its word: an alongside
activity's Stop, design review 2 N1), and `isFilled` fills the glyph in its tone (Stop's square).
*/
export const IconButton = ({
  badge,
  busy = false,
  disabled = false,
  haptic,
  hint,
  icon,
  isFilled = false,
  label,
  onPress,
  selected,
  size = "control",
  tonal = false,
}: {
  readonly badge?: undefined | { readonly count: number; readonly tone: CountTone };
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly haptic?: HapticKind | undefined;
  readonly hint?: string;
  readonly icon: IconName;
  /** Fill the glyph in its tone (a filled square for Stop). */
  readonly isFilled?: boolean;
  readonly label: string;
  readonly onPress: () => void;
  /** A toggle's state: the disc and `aria-pressed`; leave it out on a plain action. */
  readonly selected?: boolean | undefined;
  /** `bar` (24) in app bars and headers, `control` (20) in rows. */
  readonly size?: IconSize;
  /** A `fill.2` disc under the glyph, smaller than the target. */
  readonly tonal?: boolean;
}) => {
  const isBlocked = disabled || busy;
  const glyph = (
    <Glyph busy={busy} disabled={disabled} icon={icon} isFilled={isFilled} size={size} />
  );
  return (
    <Tooltip label={label}>
      <Pressable
        accessibilityHint={hint}
        aria-busy={busy}
        className={cx("items-center justify-center", selected === true && "bg-fill-3")}
        disabled={isBlocked}
        haptic={haptic}
        label={label}
        onPress={onPress}
        ripple="borderless"
        role="button"
        shape="pill"
        {...toggleOrDisc(selected, tonal)}
      >
        {badge === undefined ? (
          glyph
        ) : (
          <BadgeAnchor count={badge.count} tone={badge.tone}>
            {glyph}
          </BadgeAnchor>
        )}
      </Pressable>
    </Tooltip>
  );
};
