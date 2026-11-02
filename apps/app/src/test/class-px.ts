import theme from "#app/ui/generated/tailwind-theme.json";

type Scale = "size" | "spacing";

/** Which generated scale a class prefix reads (tailwind.config.js: sizes for h/w, spacing for p/m/gap). */
const SCALE = {
  h: "size",
  pb: "spacing",
  pt: "spacing",
  py: "spacing",
  w: "size",
} as const satisfies Readonly<Record<string, Scale>>;

const classesOf = (element: { readonly props: object }): readonly string[] => {
  const { className } = element.props as { className?: unknown };
  return typeof className === "string" ? className.split(/\s+/u) : [];
};

/** "32px" → 32. */
const pxOf = (value: string): number => Number(value.replace(/px$/u, ""));

/**
The pixels a class on a rendered element stands for, read through the generated Tailwind scale
(jest renders class names, not styles). A JS number that restates a class (a row height a layout sum
subtracts, a padding a height cap adds) is checked against this, so rounding the class cannot leave
the number behind (bug-lessons class 11, mirrors).
*/
export const classPx = (
  element: { readonly props: object },
  prefix: keyof typeof SCALE,
): number => {
  const step = classesOf(element)
    .find((name) => name.startsWith(`${prefix}-`))
    ?.slice(prefix.length + 1);
  const scale: Readonly<Record<string, string | undefined>> = theme[SCALE[prefix]];
  const value = step === undefined ? undefined : scale[step];
  if (value === undefined) {
    throw new Error(`no ${prefix}-* class on the scale in "${classesOf(element).join(" ")}"`);
  }
  return pxOf(value);
};

/** The line height (phone column) of the type role class (`text-callout`) on a rendered text. */
export const classLinePx = (element: { readonly props: object }): number => {
  // Each role is [size, { lineHeight, … }] (tailwind's fontSize tuple).
  const sizes: Readonly<
    Record<string, readonly (string | { readonly lineHeight?: string })[] | undefined>
  > = theme.fontSize;
  const metrics = classesOf(element)
    .filter((name) => name.startsWith("text-"))
    .map((name) => sizes[name.slice("text-".length)]?.[1])
    .find((entry) => entry !== undefined);
  const line = typeof metrics === "object" ? metrics.lineHeight : undefined;
  if (line === undefined) {
    throw new Error(`no type role class in "${classesOf(element).join(" ")}"`);
  }
  return pxOf(line);
};
