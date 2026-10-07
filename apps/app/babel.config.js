const fs = require("node:fs");

// Resolves a module the way Node would from `from` (a real path, so Bun's isolated
// node_modules layout is walked correctly).
const resolveFrom = (from, request) =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- `from` is a path inside this app's node_modules
  require.resolve(request, { paths: [fs.realpathSync(from)] });

// `nativewind/babel` names its plugins as bare strings that Babel resolves from
// react-native-css-interop's own directory, where neither `@babel/plugin-transform-react-jsx`
// nor `react-native-reanimated/plugin` is installed under Bun's isolated layout. This preset
// is the same list with every plugin resolved from this app instead.
const nativewindPreset = () => {
  const nativewind = `${__dirname}/node_modules/nativewind`;
  // eslint-disable-next-line security/detect-non-literal-require -- resolved from nativewind's own dependency
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
      // `nativewind/jsx-runtime` re-exports react-native-css-interop's and is resolvable from here.
      [jsxPlugin, { runtime: "automatic", importSource: "nativewind" }],
      resolveFrom(__dirname, "react-native-reanimated/plugin"),
    ],
  };
};

module.exports = function babelConfig(api) {
  // Jest compiles workspace packages (packages/core, packages/client) that do not depend on
  // @babel/runtime, so helpers are inlined there; Metro bundles keep the shared runtime.
  // jest-expo reports itself as Metro, so the worker id is the reliable signal.
  const isJest = process.env.JEST_WORKER_ID !== undefined;
  api.cache.using(() => isJest);
  return {
    presets: [
      ["babel-preset-expo", { enableBabelRuntime: !isJest, jsxImportSource: "nativewind" }],
      nativewindPreset,
    ],
  };
};
