const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

// expo/metro-config detects the Bun workspace monorepo on its own (watch folders, node_modules paths).
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  configPath: path.join(__dirname, "tailwind.config.js"),
  input: path.join(__dirname, "global.css"),
});
