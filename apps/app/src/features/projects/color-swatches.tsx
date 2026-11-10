import { View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { cx } from "#app/ui/cx.ts";
import { Pressable } from "#app/ui/pressable.tsx";
import { RadioGroup, useRadio } from "#app/ui/radio-group.tsx";
import { HueTile } from "#app/ui/tag.tsx";
import { type ProjectColorName, ProjectColorSchema } from "@pace/core";

/**
One colour as the tile a project leads with (its tint, a folder in its ink), never a dot: a dot's
colour cannot be told (owner 2026-11-08, design review L5). The chosen one is ringed in
`label.primary` and shows a check in place of the folder, a cue that is not colour.
*/
const Swatch = ({ color }: { readonly color: ProjectColorName }) => {
  const t = useT();
  const { checked, onPress, setNode, tabIndex } = useRadio(color);
  return (
    <Pressable
      checked={checked}
      label={t(`color.${color}`)}
      onPress={onPress}
      ref={setNode}
      role="radio"
      shape="md"
      tabIndex={tabIndex}
      visual={cx(
        "size-10 items-center justify-center border-2",
        checked ? "border-label-primary" : "border-transparent",
      )}
    >
      {checked ? (
        <View testID="swatch-chosen">
          <HueTile hue={color} icon="check" />
        </View>
      ) : (
        <HueTile hue={color} icon="folder" />
      )}
    </Pressable>
  );
};

/** The project colours as tinted tiles: one radio group (one tab stop), each named after its color. */
export const ColorSwatches = ({
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly value: ProjectColorName;
  readonly onChange: (color: ProjectColorName) => void;
}) => (
  <RadioGroup
    className="flex-row flex-wrap"
    label={label}
    onChange={(color: ProjectColorName) => {
      onChange(color);
    }}
    value={value}
    values={ProjectColorSchema.options}
  >
    {ProjectColorSchema.options.map((color) => (
      <Swatch color={color} key={color} />
    ))}
  </RadioGroup>
);
