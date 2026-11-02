/**
The providers' health, remembered for every user and every isolate (the store is in
`health-store.ts`): a provider that just failed in a way that says it cannot serve anyone (a 5xx,
a timeout, a dropped connection) is asked last for a while, so nobody waits on it first. The
penalty starts at a minute and doubles with each failure in a row, up to half an hour; a success
clears it. Pure: the order of a read, and what a read's outcomes change.
*/

/** A provider's record: failures in a row, until when it is asked last, and the latest reason. */
export type HealthEntry = {
  readonly strikes: number;
  /** Asked last until then (ISO); `null` while the record does not penalize yet (one slow answer). */
  readonly until: null | string;
  readonly reason: string;
};

/** Provider name → its record; a provider with none is healthy. */
export type Health = Readonly<Record<string, HealthEntry>>;

/** What one read showed about one provider it asked. */
export type Verdict = {
  readonly provider: string;
  /** Answered; could not serve (`unwell`); silent past the hedge while another answered (`slow`). */
  readonly outcome: "ok" | "slow" | "unwell";
  readonly why: string;
};

/** A record that changed: the ones that move a provider are logged, every one is written. */
export type HealthChange =
  | (HealthEntry & { readonly kind: "moved-last"; readonly provider: string })
  | { readonly kind: "noted" | "recovered"; readonly provider: string };

export const PENALTY_BASE_MS = 60_000;
export const PENALTY_CAP_MS = 30 * 60_000;

/** How long the `strikes`-th penalty in a row lasts. */
export const penaltyMs = (strikes: number): number =>
  Math.min(PENALTY_BASE_MS * 2 ** Math.max(strikes - 1, 0), PENALTY_CAP_MS);

type Standing = "healthy" | "penalized" | "probation";

const standingOf = (entry: HealthEntry | undefined, now: string): Standing => {
  if (entry?.until === undefined || entry.until === null) {
    return "healthy";
  }
  return entry.until > now ? "penalized" : "probation";
};

/**
The order to ask `providers` in at `now`: the configured one, with every provider under penalty
moved to the end (in their configured order, so with all of them under penalty nothing moves). A
provider whose penalty ran out is back in its place as a probe: the race asks the next one
alongside it at once, so nobody waits on a provider that may still be down.
*/
export const orderByHealth = <P extends { readonly name: string }>(
  providers: readonly P[],
  health: Health,
  now: string,
): { readonly ordered: readonly P[]; readonly probes: ReadonlySet<string> } => {
  const standing = (provider: P): Standing => standingOf(health[provider.name], now);
  return {
    ordered: [
      ...providers.filter((provider) => standing(provider) !== "penalized"),
      ...providers.filter((provider) => standing(provider) === "penalized"),
    ],
    probes: new Set(
      providers.filter((provider) => standing(provider) === "probation").map(({ name }) => name),
    ),
  };
};

/**
A failure on top of `entry`: one strike more and the penalty it earns. Slowness earns one only
when it repeats (the first slow answer may be a long message), so it counts a strike less.
*/
const struck = (entry: HealthEntry | undefined, verdict: Verdict, now: string): HealthEntry => {
  const strikes = (entry?.strikes ?? 0) + 1;
  const steps = verdict.outcome === "slow" ? strikes - 1 : strikes;
  return {
    reason: verdict.why,
    strikes,
    until: steps < 1 ? null : new Date(Date.parse(now) + penaltyMs(steps)).toISOString(),
  };
};

/**
What a read's verdicts change at `now`. A success clears a provider's record; a failure while
its penalty still runs changes nothing (it was asked last, as meant), so a provider that stays
down is written once per penalty, not once per request.
*/
export const nextHealth = (
  health: Health,
  verdicts: readonly Verdict[],
  now: string,
): { readonly health: Health; readonly changes: readonly HealthChange[] } => {
  let next = health;
  const changes: HealthChange[] = [];
  for (const verdict of verdicts) {
    const step = stepOf(next, verdict, now);
    if (step === null) {
      continue;
    }

    next = step.health;
    changes.push(step.change);
  }
  return { changes, health: next };
};

/** One verdict on `health`: the record after it and what changed, or `null` for no change. */
const stepOf = (
  health: Health,
  verdict: Verdict,
  now: string,
): null | { readonly health: Health; readonly change: HealthChange } => {
  const { provider } = verdict;
  const entry = health[provider];
  if (verdict.outcome === "ok") {
    return entry === undefined
      ? null
      : {
          change: { kind: "recovered", provider },
          health: Object.fromEntries(Object.entries(health).filter(([name]) => name !== provider)),
        };
  }
  if (standingOf(entry, now) === "penalized") {
    return null;
  }
  const after = struck(entry, verdict, now);
  return {
    change:
      after.until === null
        ? { kind: "noted", provider }
        : { kind: "moved-last", provider, ...after },
    health: { ...health, [provider]: after },
  };
};
