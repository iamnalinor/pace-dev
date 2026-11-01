const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const fs = require("node:fs");
const path = require("node:path");

// expo/metro-config detects the Bun workspace monorepo on its own (watch folders, node_modules paths).
const config = getDefaultConfig(__dirname);

// Packages that must exist once in the bundle. Workspace packages (`@pace/client`) resolve
// their own copies under Bun's isolated installs; their React would differ from the app's.
const SINGLETONS = ["react", "react-dom", "react-native", "react-native-web", "zustand"];
const isSingleton = (moduleName) =>
  SINGLETONS.some((name) => moduleName === name || moduleName.startsWith(`${name}/`));

// Phone-only Expo modules: the web build gets these stand-ins (src/platform/web).
const WEB = path.join(__dirname, "src/platform/web");
const WEB_SHIMS = {
  "expo-background-task": path.join(WEB, "phone-only.ts"),
  "expo-calendar": path.join(WEB, "phone-only.ts"),
  "expo-notifications": path.join(WEB, "phone-only.ts"),
  "expo-secure-store": path.join(WEB, "secure-store.ts"),
  "expo-share-intent": path.join(WEB, "share-intent.tsx"),
  "expo-task-manager": path.join(WEB, "phone-only.ts"),
};

const APP_SOURCE = [path.join(__dirname, "src"), path.join(__dirname, "app")];

/** `x.ts` → `x.web.ts` when that file exists (imports name files with their extension). */
const webVariant = (filePath) => {
  const candidate = filePath.replace(/\.(tsx?)$/u, ".web.$1");
  const isAppFile = APP_SOURCE.some((root) => filePath.startsWith(root));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a sibling of a file Metro already resolved inside the app
  return isAppFile && candidate !== filePath && fs.existsSync(candidate) ? candidate : filePath;
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && Object.hasOwn(WEB_SHIMS, moduleName)) {
    return { filePath: WEB_SHIMS[moduleName], type: "sourceFile" };
  }
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  const originModulePath = isSingleton(moduleName)
    ? path.join(__dirname, "index.js")
    : context.originModulePath;
  const resolved = resolve({ ...context, originModulePath }, moduleName, platform);
  return platform === "web" && resolved.type === "sourceFile"
    ? { ...resolved, filePath: webVariant(resolved.filePath) }
    : resolved;
};

module.exports = withNativeWind(config, {
  configPath: path.join(__dirname, "tailwind.config.js"),
  input: path.join(__dirname, "global.css"),
});
