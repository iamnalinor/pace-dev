import { appVersion } from "./app-version.ts";

const RELEASE = { describe: "", hoursSinceTag: 0 };

describe("appVersion", () => {
  it("takes a release's version from its tag", () => {
    expect(appVersion({ ...RELEASE, releaseTag: "v0.8.0" })).toEqual({
      version: "0.8.0",
      versionCode: 800_000,
    });
    expect(appVersion({ ...RELEASE, releaseTag: "v1.2.3" }).versionCode).toBe(10_203_000);
  });

  it("builds between releases on the last tag, so they install over it", () => {
    const dev = appVersion({ describe: "v0.8.0-7-gcfd5334", hoursSinceTag: 30, releaseTag: "" });
    expect(dev).toEqual({ version: "0.8.0-dev.7+cfd5334", versionCode: 800_030 });
    // Above the release it follows (and the 800 the old scheme gave v0.8.0), below the next one.
    expect(dev.versionCode).toBeGreaterThan(
      appVersion({ ...RELEASE, releaseTag: "v0.8.0" }).versionCode,
    );
    expect(dev.versionCode).toBeLessThan(
      appVersion({ ...RELEASE, releaseTag: "v0.8.1" }).versionCode,
    );
  });

  it("counts by the commit's time, so a squash merge of a long branch still goes up", () => {
    // The branch: 19 commits over a day. Main after its squash merge: 2 commits, an hour later.
    const branch = appVersion({
      describe: "v0.8.0-19-gaaaaaaa",
      hoursSinceTag: 24,
      releaseTag: "",
    });
    const main = appVersion({ describe: "v0.8.0-2-gbbbbbbb", hoursSinceTag: 25, releaseTag: "" });
    expect(main.versionCode).toBeGreaterThan(branch.versionCode);
  });

  it("caps the hours since a tag below the next release", () => {
    expect(
      appVersion({ describe: "v0.8.0-3-gabcdef1", hoursSinceTag: 1500, releaseTag: "" })
        .versionCode,
    ).toBe(800_999);
  });

  it("is a plain dev build without git or tags", () => {
    expect(appVersion({ ...RELEASE, releaseTag: "" })).toEqual({
      version: "0.0.0-dev",
      versionCode: 1,
    });
  });
});
