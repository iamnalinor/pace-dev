const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

// expo/metro-config detects the Bun workspace monorepo on its own (watch folders, node_modules paths).
const config = getDefaultConfig(__dirname);

// Packages that must exist once in the bundle. Workspace packages (`@pace/client`) resolve
// their own copies under Bun's isolated installs; their React would differ from the app's.
const SINGLETONS = ["react", "react-native", "zustand"];
const isSingleton = (moduleName) =>
  SINGLETONS.some((name) => moduleName === name || moduleName.startsWith(`${name}/`));

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  const originModulePath = isSingleton(moduleName)
    ? path.join(__dirname, "index.js")
    : context.originModulePath;
  return resolve({ ...context, originModulePath }, moduleName, platform);
};

module.exports = withNativeWind(config, {
  configPath: path.join(__dirname, "tailwind.config.js"),
  input: path.join(__dirname, "global.css"),
});
