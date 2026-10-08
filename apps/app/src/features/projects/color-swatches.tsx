import { Pressable, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { PROJECT_FILL } from "#app/ui/color.tsx";
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
              "h-11 w-11 items-center justify-center rounded-full",
              isChosen && "bg-raised",
            )}
            key={color}
            onPress={() => {
              onChange(color);
            }}
          >
            <View
              className={cx(
                "h-5 w-5 rounded-full",
                PROJECT_FILL[color],
                isChosen && "border-2 border-fg",
              )}
            />
          </Pressable>
        );
      })}
    </View>
  );
};
