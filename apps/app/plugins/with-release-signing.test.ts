import { applyReleaseSigning } from "./with-release-signing.js";

// Trimmed copy of the Expo SDK 57 `android/app/build.gradle` template: the two anchors the
// plugin relies on (the debug signing block and both `signingConfig signingConfigs.debug` lines).
const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

const buildType = (gradle: string, name: "debug" | "release"): string =>
  // Both build types are the only `<name> {` blocks that follow `buildTypes {`.
  gradle.split("buildTypes {", 2)[1]?.split(`${name} {`)[1]?.split("}", 1)[0] ?? "";

describe("with-release-signing", () => {
  it("adds a release signing config next to the debug one", () => {
    const gradle = applyReleaseSigning(TEMPLATE);

    const signingConfigs = gradle.split("signingConfigs {", 2)[1]?.split("buildTypes {", 1)[0] ?? "";
    expect(signingConfigs).toContain("release {");
    expect(signingConfigs).toContain("findProperty('PACE_STORE_FILE')");
    expect(signingConfigs).toContain("file('../../keystores/debug.keystore')");
  });

  it("signs the release build type with the release config and leaves debug alone", () => {
    const gradle = applyReleaseSigning(TEMPLATE);

    expect(buildType(gradle, "debug")).toContain("signingConfig signingConfigs.debug");
    expect(buildType(gradle, "release")).toContain("signingConfig signingConfigs.release");
    expect(buildType(gradle, "release")).not.toContain("signingConfigs.debug");
  });

  it("is idempotent over the whole file (one release block, one replacement)", () => {
    const gradle = applyReleaseSigning(TEMPLATE);

    expect(gradle.match(/signingConfigs\.release/g)).toHaveLength(1);
    expect(gradle.match(/signingConfigs\.debug/g)).toHaveLength(1);
  });

  it("fails loudly when the Expo template changed", () => {
    expect(() => applyReleaseSigning("android {}")).toThrow(/template changed/);
    expect(() => applyReleaseSigning(TEMPLATE.replaceAll('signingConfigs.debug', "x"))).toThrow(
      /template changed/,
    );
  });
});
