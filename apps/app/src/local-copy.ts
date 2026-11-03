import type { PaceRuntime } from "./runtime.ts";

/**
How a tab came to be signed out: by its own hand (Log out, ending its own session, deleting the
account: the person is leaving this browser) or stale (a 401 for a session ended elsewhere, or a
sign-out heard from another tab).
*/
export type SignOutCause = "own" | "stale";

/** A sign-out with a reason was heard, not done: the server or another tab ended the session. */
export const signOutCauseOf = (state: {
  readonly endedElsewhere?: true | undefined;
  readonly endedInAnotherTab?: true | undefined;
}): SignOutCause =>
  state.endedElsewhere === true || state.endedInAnotherTab === true ? "stale" : "own";

/**
A stale tab's sign-out: the local copy (IndexedDB, shared by a browser's tabs) goes only when no
session is left in the shared store, and only while it is still the leaving session's: a stale tab's late
401 never wipes the copy of the tab that signed in since (round 6 I1), even when that tab signs
in between the check and the wipe (the owner is compared in the clear's own transaction,
re-review N3). A different account there gets a new store id, and its first pull drops the old
copy on its own.
*/
const dropLocalCopyIfOwned = async (
  runtime: PaceRuntime,
  leaving: string | undefined,
): Promise<void> => {
  if (await runtime.auth.isSessionStored()) {
    return;
  }
  await (leaving === undefined ? runtime.resetLocalData() : runtime.dropLocalCopyOf(leaving));
};

/**
This tab's own sign-out: when no session is left in the shared store the person is leaving this
browser, so the copy goes whatever owner mark it carries (a failed claim, a token replaced while
signed in: fix round 2 review M1); a store that cannot be read counts as empty, failing toward
privacy. While another tab's session is still stored the browser stays signed in and that tab
holds the copy and its unsent changes, so it stays (A9 review I1).
*/
const dropLocalCopyOnOwnSignOut = async (runtime: PaceRuntime): Promise<void> => {
  if (await runtime.auth.isSessionStored()) {
    return;
  }
  await runtime.resetLocalData();
};

/** What a sign-out does to the local copy, by how the tab came to be signed out. */
export const dropLocalCopyOnSignOut = async (
  runtime: PaceRuntime,
  { cause, leaving }: { readonly cause: SignOutCause; readonly leaving: string | undefined },
): Promise<void> => {
  await (cause === "own"
    ? dropLocalCopyOnOwnSignOut(runtime)
    : dropLocalCopyIfOwned(runtime, leaving));
};

/**
Marks the copy as this session's. A store that refuses the write leaves the mark as it was (none
after a sign-out's clear, which a stale tab's sign-out treats as anyone's, the rule before owners):
the start goes on.
*/
export const claimLocalCopy = async (
  runtime: PaceRuntime,
  session: string | undefined,
): Promise<void> => {
  if (session === undefined) {
    return;
  }
  try {
    await runtime.claimLocalCopy(session);
  } catch {
    // The mark stays as it was: see above.
  }
};
