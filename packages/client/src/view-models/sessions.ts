import {
  countryName,
  formatDuration,
  formatInZone,
  formatShortDate,
  type Language,
  type MessageKey,
  minutesBetween,
  type Session,
  t,
} from "@pace/core";

/** Older data than this shows as the exact time it came, not how long ago (owner's threshold). */
export const LAST_DATA_EXACT_AFTER_HOURS = 8;

/** One line of Settings → Devices and sessions, worded for the viewer. */
export type SessionRow = {
  readonly id: string;
  readonly kind: Session["kind"];
  /** As the session was named (a browser, a phone model, a computer's typed name, an MCP app). */
  readonly name: string;
  /** The parts of the line under the name, joined by the screen. */
  readonly meta: readonly string[];
  /** An agent is disconnected; everything else is revoked. */
  readonly action: "disconnect" | "revoke";
  readonly isCurrent: boolean;
};

export type SessionRowsContext = {
  readonly now: string;
  readonly zone: string;
  readonly language: Language;
};

/** "Oct 12, 23:10" in the viewer's zone (with the year when it is not this one). */
const dayAndTime = (at: string, { language, now, zone }: SessionRowsContext): string =>
  `${formatShortDate(at, now, { language, tz: zone })}, ${formatInZone(at, zone, "HH:mm")}`;

/** The kind of each session, in words (the row's icon says it only to a screen reader). */
const KIND_KEY = {
  agent: "sessions.kind.agent",
  app: "sessions.kind.app",
  browser: "sessions.kind.browser",
  dev: "sessions.kind.dev",
  mcp: "sessions.kind.mcp",
} as const satisfies Record<Session["kind"], MessageKey>;

/** "Last data 2h 10m ago" up to eight hours, then "Last data Oct 12, 23:10"; "Nothing sent yet". */
const lastDataText = (lastDataAt: null | string, context: SessionRowsContext): string => {
  const { language, now } = context;
  if (lastDataAt === null) {
    return t(language, "devices.nothingYet");
  }
  const minutes = Math.max(0, minutesBetween(lastDataAt, now));
  if (minutes > LAST_DATA_EXACT_AFTER_HOURS * 60) {
    return t(language, "devices.lastDataAt", { time: dayAndTime(lastDataAt, context) });
  }
  return minutes < 1
    ? t(language, "devices.justNow")
    : t(language, "devices.lastActivity", { duration: formatDuration(minutes, language) });
};

/**
When it came in: a computer or an AI app was added, the rest signed in. It tells same-name rows
apart (several "My computer", dev logins); the current session needs no such line.
*/
const sinceText = (session: Session, context: SessionRowsContext): readonly string[] => {
  if (session.current) {
    return [];
  }
  const time = dayAndTime(new Date(session.createdAt).toISOString(), context);
  const isAdded = session.kind === "agent" || session.kind === "mcp";
  return [t(context.language, isAdded ? "sessions.added" : "sessions.signedIn", { time })];
};

/** Its kind in words, where it is, what it last sent (an app or an agent), when it came in. */
const metaOf = (session: Session, context: SessionRowsContext): readonly string[] => {
  const place = session.current
    ? [t(context.language, "devices.thisDevice")]
    : [
        ...(session.country === null ? [] : [countryName(session.country, context.language)]),
        ...(session.ip === null ? [] : [session.ip]),
      ];
  const isUsageSender = session.kind === "app" || session.kind === "agent";
  return [
    t(context.language, KIND_KEY[session.kind]),
    ...place,
    ...(isUsageSender ? [lastDataText(session.lastDataAt, context)] : []),
    ...sinceText(session, context),
  ];
};

/** The current session first, then the most recently seen; never seen (an MCP app) last. */
const byRecency = (a: Session, b: Session): number => {
  if (a.current !== b.current) {
    return a.current ? -1 : 1;
  }
  const seen = (b.lastSeenAt ?? -1) - (a.lastSeenAt ?? -1);
  return seen === 0 ? b.createdAt - a.createdAt : seen;
};

/** Settings → Devices and sessions: every way into the account, worded for the viewer. */
export const sessionRows = (
  sessions: readonly Session[],
  context: SessionRowsContext,
): readonly SessionRow[] =>
  sessions.toSorted(byRecency).map((session) => ({
    action: session.kind === "agent" ? "disconnect" : "revoke",
    id: session.id,
    isCurrent: session.current,
    kind: session.kind,
    meta: metaOf(session, context),
    name: session.name,
  }));
