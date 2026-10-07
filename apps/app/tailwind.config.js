const tokens = require("@pace/core/design/tokens.json");

// Semantic colors come from CSS variables so the same class names work in both themes;
// the variables are defined per theme in app/_layout.tsx via NativeWind's `vars()`.
const semantic = Object.fromEntries(
  Object.keys(tokens.dark).map((name) => [name, `var(--pace-${name})`]),
);
const project = Object.fromEntries(
  Object.entries(tokens.project).map(([name, value]) => [`project-${name}`, value]),
);
const radius = Object.fromEntries(
  Object.entries(tokens.radius).map(([name, value]) => [name, `${value}px`]),
);

/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: { ...semantic, ...project },
      borderRadius: radius,
      fontFamily: { sans: [tokens.fonts.sans], mono: [tokens.fonts.mono] },
    },
  },
  plugins: [],
};
