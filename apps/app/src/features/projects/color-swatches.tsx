import { Pressable, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { fillClass } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { type ProjectColorName, ProjectColorSchema } from "@pace/core";

/** The project colors as round swatches; each is a radio named after its color. */
export const ColorSwatches = ({
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly value: ProjectColorName;
  readonly onChange: (color: ProjectColorName) => void;
}) => {
  const t = useT();
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="radiogroup"
      className="flex-row flex-wrap gap-1"
    >
      {ProjectColorSchema.options.map((color) => {
        const isChosen = color === value;
        return (
          <Pressable
            accessibilityLabel={t(`color.${color}`)}
            accessibilityRole="radio"
            aria-checked={isChosen}
            className={cx(
              "h-hit-web w-hit-web items-center justify-center rounded-pill",
              isChosen && "bg-fill-3",
            )}
            key={color}
            onPress={() => {
              onChange(color);
            }}
          >
            <View
              className={cx(
                "h-5 w-5 rounded-pill",
                fillClass(color),
                isChosen && "border-2 border-label-primary",
              )}
            />
          </Pressable>
        );
      })}
    </View>
  );
};
