const fs = require("node:fs");

// Resolves a module the way Node would from `from` (a real path, so Bun's isolated
// node_modules layout is walked correctly).
const resolveFrom = (from, request) =>
  require.resolve(request, { paths: [fs.realpathSync(from)] });

// `nativewind/babel` names its plugins as bare strings that Babel resolves from
// react-native-css-interop's own directory, where neither `@babel/plugin-transform-react-jsx`
// nor `react-native-reanimated/plugin` is installed under Bun's isolated layout. This preset
// is the same list with every plugin resolved from this app instead.
const nativewindPreset = () => {
  const nativewind = `${__dirname}/node_modules/nativewind`;
  const cssInteropPlugin = require(
    resolveFrom(nativewind, "react-native-css-interop/dist/babel-plugin"),
  ).default;
  const jsxPlugin = resolveFrom(
    `${__dirname}/node_modules/babel-preset-expo`,
    "@babel/plugin-transform-react-jsx",
  );
  return {
    plugins: [
      cssInteropPlugin,
      [jsxPlugin, { runtime: "automatic", importSource: "react-native-css-interop" }],
      resolveFrom(__dirname, "react-native-reanimated/plugin"),
    ],
  };
};

module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], nativewindPreset],
  };
};
