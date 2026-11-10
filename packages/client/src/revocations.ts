import { err, type Event, ok, type Result, revokedIdsIn } from "@pace/core";

type Revocations = {
  readonly revoke: (eventId: string) => Promise<Result<Event, string>>;
  readonly revokeAll: (eventIds: readonly string[]) => Promise<Result<readonly Event[], string>>;
};

type RevocationInput = {
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly payload: { readonly targetId: string };
  readonly type: "event.revoked";
};

/** The store's stage, as revocations use it (`AppStateHandle["stage"]`). */
type Stage = (
  inputs: readonly RevocationInput[],
  refusal: () => null | string,
) => Promise<
  Result<
    {
      readonly events: readonly Event[];
      readonly persisted: Promise<{ readonly ok: boolean }>;
    },
    string
  >
>;

/**
The store's revocations: one event, or several as one action. A batch shares one instant (History
shows it as the one action it was, QA round 26 R26-10) and is staged and written in one go, or
not at all; a target revoked already is refused (`action/nothing-to-do`, review M2), checked in
the store's write queue so a revocation staged a moment before counts (review I4).
*/
export const createRevocations = ({
  hasEvent,
  log,
  now,
  ready,
  stage,
}: {
  readonly hasEvent: (eventId: string) => boolean;
  /** Every event of the store, corrections included. */
  readonly log: () => readonly Event[];
  readonly now: () => string;
  readonly ready: Promise<void>;
  readonly stage: Stage;
}): Revocations => {
  /** Why the events cannot be revoked now, if they cannot: the log's revoked set read once. */
  const refusalOf = (eventIds: readonly string[]): null | string => {
    const revoked = revokedIdsIn(log());
    const codes = eventIds.map((id) => {
      if (!hasEvent(id)) {
        return "event/not-found";
      }
      return revoked.has(id) ? "action/nothing-to-do" : null;
    });
    return codes.find((code) => code !== null) ?? null;
  };

  const revokeAll: Revocations["revokeAll"] = async (eventIds) => {
    await ready;
    const ids = [...new Set(eventIds)];
    if (ids.length === 0) {
      return err("action/nothing-to-do");
    }
    const at = now();
    // Checked in the write queue: two Undos of one event in one tick write one revocation (I4).
    const staged = await stage(
      ids.map((id) => ({
        occurredAt: at,
        payload: { targetId: id },
        recordedAt: at,
        type: "event.revoked" as const,
      })),
      () => refusalOf(ids),
    );
    if (!staged.ok) {
      return staged;
    }
    const written = await staged.value.persisted;
    return written.ok ? ok(staged.value.events) : err("persist_failed");
  };

  const revoke: Revocations["revoke"] = async (eventId) => {
    const revoked = await revokeAll([eventId]);
    if (!revoked.ok) {
      return revoked;
    }
    const [revocation] = revoked.value;
    return revocation === undefined ? err("persist_failed") : ok(revocation);
  };

  return { revoke, revokeAll };
};
