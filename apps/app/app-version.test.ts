import { appVersion } from "./app-version.ts";

describe("appVersion", () => {
  it("takes a release's version from its tag", () => {
    expect(appVersion({ describe: "", releaseTag: "v0.8.0" })).toEqual({
      version: "0.8.0",
      versionCode: 800_000,
    });
    expect(appVersion({ describe: "", releaseTag: "v1.2.3" }).versionCode).toBe(10_203_000);
  });

  it("builds between releases on the last tag, so they install over it", () => {
    const dev = appVersion({ describe: "v0.8.0-7-gcfd5334", releaseTag: "" });
    expect(dev).toEqual({ version: "0.8.0-dev.7+cfd5334", versionCode: 800_007 });
    // Above the release it follows (and the 800 the old scheme gave v0.8.0), below the next one.
    expect(dev.versionCode).toBeGreaterThan(
      appVersion({ describe: "", releaseTag: "v0.8.0" }).versionCode,
    );
    expect(dev.versionCode).toBeLessThan(
      appVersion({ describe: "", releaseTag: "v0.8.1" }).versionCode,
    );
  });

  it("caps the commits since a tag below the next release", () => {
    expect(appVersion({ describe: "v0.8.0-1500-gabcdef1", releaseTag: "" }).versionCode).toBe(
      800_999,
    );
  });

  it("is a plain dev build without git or tags", () => {
    expect(appVersion({ describe: "", releaseTag: "" })).toEqual({
      version: "0.0.0-dev",
      versionCode: 1,
    });
  });
});
