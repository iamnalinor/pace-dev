/** The design-value backlog (redesign-plan, "Lint baseline"). */
export const DESIGN_VALUE_RULE = "pace/no-raw-design-values";

/**
The bare-pressable backlog (bug-lessons, F-CMP-01): a React Native `Pressable` or `Touchable*`
imported by feature or shared code instead of the kit's `#app/ui/pressable`.
*/
export const BARE_PRESSABLE_RULE = "no-restricted-imports";

/**
The message the bare-pressable ban carries (`eslint.config.ts`), and what the ratchet counts it by:
another `no-restricted-imports` warning is not this backlog's.
*/
export const BARE_PRESSABLE_MARKER =
  "A bare pressable has no state layer (no ripple, hover or focus ring): use Pressable from #app/ui/pressable.";

/**
The kit-primitive backlog (bug-lessons 109, spec §4.1.2 rule 9): a lucide icon imported outside the
kit's `Icon`, or `numberOfLines` on React Native's `Text` outside the kit's `Text`.
*/
export const KIT_PRIMITIVE_RULE = "pace/kit-primitives";

/**
One backlog counted down: its rule, the constant in `eslint-all.ts` that holds its number, and, for
a rule other backlogs or bans may share, the text its own messages carry (`marker`).
*/
export type Ratchet = {
  readonly allowance: number;
  readonly constant: string;
  readonly marker?: string;
  readonly rule: string;
};

type Message = { message?: string; ruleId: null | string; severity: number };

type Result = {
  messages: readonly Message[];
  warningCount: number;
};

const isCounted = ({ marker, rule }: Ratchet, message: Message): boolean =>
  message.ruleId === rule && (marker === undefined || (message.message ?? "").includes(marker));

type Summary = { counts: Readonly<Record<string, number>>; problem: string | undefined };

/** What one ratchet says about its count, if anything is wrong. */
const ratchetProblem = ({ allowance, constant, rule }: Ratchet, count: number) => {
  if (count > allowance) {
    return `${count} ${rule} warnings, ${allowance} allowed (${constant}): the backlog grew; fix the new ones (design values: use the tokens; pressables, icons and line limits: use the kit's).`;
  }
  return count < allowance
    ? `${count} ${rule} warnings, ${allowance} allowed: lower ${constant} to ${count} in scripts/eslint-all.ts (and update the plan's "Lint baseline").`
    : undefined;
};

/**
The ratchets: a part must report exactly each ratchet's `allowance` warnings of its rule — more is
a regression, fewer means the developer lowers the constant so the gain stays. Any other warning
is a failure (the whole lint is otherwise zero-tolerance).
*/
export const summarise = (results: readonly Result[], ratchets: readonly Ratchet[]): Summary => {
  const messages = results.flatMap((result) => result.messages);
  const counts: Readonly<Record<string, number>> = Object.fromEntries(
    ratchets.map((ratchet) => [
      ratchet.constant,
      messages.filter((message) => isCounted(ratchet, message)).length,
    ]),
  );
  const counted = Object.values(counts).reduce((total, count) => total + count, 0);
  const warnings = results.reduce((total, result) => total + result.warningCount, 0);
  const others = warnings - counted;
  if (others > 0) {
    return { counts, problem: `${others} other warning(s): fix them.` };
  }
  const problems = ratchets
    .map((ratchet) => ratchetProblem(ratchet, counts[ratchet.constant] ?? 0))
    .filter((problem) => problem !== undefined);
  return { counts, problem: problems.length > 0 ? problems.join(" ") : undefined };
};
