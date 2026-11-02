import type { UnwellReason } from "./failure.ts";

/**
The providers' health, remembered for every user and every isolate (the store is in
`health-store.ts`): a provider that just failed in a way that says it cannot serve anyone (a 5xx,
a timeout, a dropped connection) is asked last for a while, so nobody waits on it first. The
penalty starts at a minute and doubles with each failure in a row, up to half an hour; a success
clears it. Pure: the order of a read, and what a read's outcomes change.
*/

/** Why a provider is held back, as a category (never free text, which may quote the person). */
export type HealthReason = "slow" | UnwellReason;

export const HEALTH_REASONS = [
  "dropped",
  "gone",
  "server-error",
  "slow",
  "timeout",
] as const satisfies readonly HealthReason[];

/** A provider's record: failures in a row, until when it is asked last, and the latest reason. */
export type HealthEntry = {
  readonly strikes: number;
  /** Asked last until then (ISO); `null` while the record does not penalize yet (one slow answer). */
  readonly until: null | string;
  readonly reason: HealthReason;
};

/** Provider name → its record; a provider with none is healthy. */
export type Health = Readonly<Record<string, HealthEntry>>;

/**
What one read showed about one provider it asked: answered or started to (`ok`: a first token
counts); could not serve (`unwell`); silent past the hedge while another answered (`slow`); a
probe that showed none of these (`unjudged`: the read ended before it could, bug class 96).
*/
export type Verdict =
  | { readonly provider: string; readonly outcome: "ok" }
  | { readonly provider: string; readonly outcome: "slow"; readonly why: "slow" }
  | { readonly provider: string; readonly outcome: "unjudged" }
  | { readonly provider: string; readonly outcome: "unwell"; readonly why: UnwellReason };

/** A verdict against the provider. */
type Failed = Extract<Verdict, { readonly outcome: "slow" | "unwell" }>;

/**
A record that changed. `moved-last`, `recovered` and `returned` (a probe back in its place,
unjudged) change who is asked first and are logged and kept for every isolate; `noted` (a
first slow answer) changes no order.
*/
export type HealthChange =
  | (HealthEntry & { readonly kind: "moved-last"; readonly provider: string })
  | { readonly kind: "noted" | "recovered" | "returned"; readonly provider: string };

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

/** What a read knows of one provider it asked, for its verdict. */
export type Asked = {
  readonly provider: string;
  readonly isWinner: boolean;
  /** It failed: why it could not serve anyone, `null` for a failure about this request only. */
  readonly failure?: null | UnwellReason;
  /** It sent a first token. */
  readonly hasSpoken: boolean;
  /** Still silent past the hedge when the read ended, and another provider answered. */
  readonly isOutwaited: boolean;
  readonly isProbe: boolean;
};

/**
The verdict on one provider a read asked, or `null` when it says nothing: the winner answered; a
failure that says the provider cannot serve anyone counts against it; a first token proves it up
(a probe that started to answer has recovered, though another answered first); silence past the
hedge while another answered is slow (never when nobody answered: a deadline strikes nobody); a
probe with none of these is unjudged, and goes back to its place (bug class 96).
*/
export const verdictOf = (asked: Asked): null | Verdict => {
  const { provider } = asked;
  if (asked.isWinner) {
    return { outcome: "ok", provider };
  }
  if (asked.failure !== undefined && asked.failure !== null) {
    return { outcome: "unwell", provider, why: asked.failure };
  }
  if (asked.hasSpoken) {
    return { outcome: "ok", provider };
  }
  if (asked.isOutwaited) {
    return { outcome: "slow", provider, why: "slow" };
  }
  return asked.isProbe ? { outcome: "unjudged", provider } : null;
};

/**
A failure on top of `entry`: one strike more and the penalty it earns. Slowness earns one only
when it repeats (the first slow answer may be a long message), so it counts a strike less.
*/
const struck = (entry: HealthEntry | undefined, verdict: Failed, now: string): HealthEntry => {
  const strikes = (entry?.strikes ?? 0) + 1;
  const steps = verdict.outcome === "slow" ? strikes - 1 : strikes;
  return {
    reason: verdict.why,
    strikes,
    until: steps < 1 ? null : new Date(Date.parse(now) + penaltyMs(steps)).toISOString(),
  };
};

/**
What a read's verdicts change at `now`. A success (or a first token) clears a provider's record;
a probe the read could not judge goes back to its place, its strikes kept, so no read after asks
two providers for it; a failure while its penalty still runs changes nothing (it was asked last,
as meant), so a provider that stays down is written once per penalty, not once per request.
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
  if (verdict.outcome === "unjudged") {
    return entry === undefined || standingOf(entry, now) !== "probation"
      ? null
      : {
          change: { kind: "returned", provider },
          health: { ...health, [provider]: { ...entry, until: null } },
        };
  }
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
