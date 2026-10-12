export type AppVersion = { readonly version: string; readonly versionCode: number };

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/u;
/** `git describe --tags --long`: the last tag, the commits since it and the commit. */
const DESCRIBED = /^v(\d+)\.(\d+)\.(\d+)-(\d+)-g([0-9a-f]+)$/u;
/** Room for builds between two releases: a release's code times this, plus hours since. */
const BUILDS_PER_RELEASE = 1000;

/** "X.Y.Z" and its release code from a match's first three groups. */
const releaseOf = (match: RegExpExecArray): AppVersion => {
  const [major, minor, patch] = match.slice(1, 4).map(Number);
  return {
    version: `${major}.${minor}.${patch}`,
    versionCode: ((major ?? 0) * 10_000 + (minor ?? 0) * 100 + (patch ?? 0)) * BUILDS_PER_RELEASE,
  };
};

/**
The version and versionCode of an Android build. A release (tag `vX.Y.Z`) is `X.Y.Z` with
code `(X·10000 + Y·100 + Z)·1000`; a build between releases sits on the last tag,
`X.Y.Z-dev.N+sha` (N commits since) with that code plus the hours from the tag's commit to its
own, so it installs over the release it follows and the next release installs over it. Android
refuses an APK whose code is lower than the one in place: hours, unlike commits, keep growing
when a long branch lands on main as one squashed commit.
*/
export const appVersion = ({
  describe,
  hoursSinceTag,
  releaseTag,
}: {
  /** From the tag's commit to the built commit (committer times), whole hours. */
  readonly hoursSinceTag: number;
  /** The tag a release is built from (`vX.Y.Z`), empty otherwise. */
  readonly releaseTag: string;
  /** `git describe --tags --long --match 'v*'`, empty without git or tags. */
  readonly describe: string;
}): AppVersion => {
  const release = TAG.exec(releaseTag);
  if (release !== null) {
    return releaseOf(release);
  }
  const described = DESCRIBED.exec(describe);
  if (described === null) {
    return { version: "0.0.0-dev", versionCode: 1 };
  }
  const base = releaseOf(described);
  return {
    version: `${base.version}-dev.${described[4] ?? ""}+${described[5] ?? ""}`,
    versionCode:
      base.versionCode + Math.min(Math.max(0, Math.floor(hoursSinceTag)), BUILDS_PER_RELEASE - 1),
  };
};
