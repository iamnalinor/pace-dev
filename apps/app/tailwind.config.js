const plugin = require("tailwindcss/plugin");

// Generated from the design tokens by scripts/design/generate-design.ts (`bun design:generate`).
const generated = require("./src/ui/generated/tailwind-theme.json");

// Each type role switches to its desktop column at `lg` (≥ 1024): one class, both sizes.
const desktopType = plugin(({ addUtilities }) => {
  addUtilities({
    [`@media (min-width: ${generated.screens.lg})`]: Object.fromEntries(
      Object.entries(generated.typeDesktop).map(([name, style]) => [`.text-${name}`, style]),
    ),
  });
});

const size = generated.size;

/**
The theme is replaced, not extended, by the token scales (spec §3): a class off the scale does not
exist. Colours are CSS variables, so the same class works in both themes; the variables are set per
theme on the root view by NativeWind's `vars()` (src/platform/theme.ts).
*/
/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    screens: generated.screens,
    colors: generated.colors,
    spacing: generated.spacing,
    height: size,
    width: size,
    minHeight: size,
    minWidth: size,
    maxHeight: size,
    maxWidth: size,
    size,
    fontSize: generated.fontSize,
    fontWeight: generated.fontWeight,
    lineHeight: {},
    letterSpacing: {},
    borderRadius: generated.borderRadius,
    extend: {
      borderWidth: generated.borderWidth,
      flex: generated.flex,
      // In `extend`, after NativeWind's preset (which sets a platform font): the phone uses the
      // first family (embedded by expo-font); the web falls back glyph by glyph.
      fontFamily: generated.fontFamily,
    },
  },
  plugins: [desktopType],
};
