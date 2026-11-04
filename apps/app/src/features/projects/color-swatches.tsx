import { View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { cx } from "#app/ui/cx.ts";
import { fillClass } from "#app/ui/hue.ts";
import { Pressable } from "#app/ui/pressable.tsx";
import { RadioGroup, useRadio } from "#app/ui/radio-group.tsx";
import { type ProjectColorName, ProjectColorSchema } from "@pace/core";

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
      shape="pill"
      tabIndex={tabIndex}
      visual={cx("size-8 items-center justify-center", checked && "bg-fill-3")}
    >
      <View
        className={cx(
          "size-5 rounded-pill",
          fillClass(color),
          checked && "border-2 border-label-primary",
        )}
      />
    </Pressable>
  );
};

/** The project colors as round swatches: one radio group (one tab stop), each named after its color. */
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
