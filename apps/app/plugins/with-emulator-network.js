const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");

const RESOURCE_NAME = "pace_emulator_network_security";
const POLICY = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">10.0.2.2</domain>
    </domain-config>
</network-security-config>
`;

// The manifest references the resource, so a missing policy fails the test APK build.
module.exports = function withEmulatorNetwork(config) {
  const withPolicy = withDangerousMod(config, [
    "android",
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, "app/src/main/res/xml");
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Expo provides the generated Android project root
      await mkdir(dir, { recursive: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed resource name inside the generated Android project
      await writeFile(path.join(dir, `${RESOURCE_NAME}.xml`), POLICY);
      return c;
    },
  ]);

  return withAndroidManifest(withPolicy, (c) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    application.$["android:networkSecurityConfig"] = `@xml/${RESOURCE_NAME}`;
    return c;
  });
};
