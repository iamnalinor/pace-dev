import { APICallError, type LanguageModel } from "ai";

import {
  blankModelAction,
  formatInZone,
  type ModelAction,
  type ModelOutput,
  type ParseDomain,
  REQUEST_DOMAINS,
  type RequestDomain,
  typedActivity,
  typedSpan,
  wallClockInstant,
} from "@pace/core";

import { DOMAIN_LINES } from "./prompt.ts";

/** What a scripted model does with a message: answer it, be rate limited, or refuse its key. */
export type FakeReply =
  | ModelOutput
  | { readonly rateLimitedFor: number }
  | { readonly refusedWith: 401 | 403 };

const USAGE = {
  inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: undefined, total: 100 },
  outputTokens: { reasoning: undefined, text: undefined, total: 50 },
};

type PromptMessage = { readonly role: string; readonly content: unknown };

/** The user's message as the model receives it. */
const messageOf = (prompt: readonly PromptMessage[]): string => {
  const user = prompt.findLast((message) => message.role === "user");
  const parts = Array.isArray(user?.content) ? (user.content as readonly { text?: string }[]) : [];
  return parts.map((part) => part.text ?? "").join("");
};

/** The system instructions, which say which question this is. */
const systemOf = (prompt: readonly PromptMessage[]): string => {
  const system = prompt.find((message) => message.role === "system");
  return typeof system?.content === "string" ? system.content : "";
};

/**
A model for tests and the e2e Worker (`LLM_PROVIDER=fake`): it never leaves the process.
`reply` decides per message; a rate limit throws the 429 a real provider would.
*/
/** A model object of the current provider specification (`LanguageModel` also admits ids). */
type ModelObject = Extract<LanguageModel, { readonly specificationVersion: "v4" }>;

export const fakeParseModel = (
  reply: (text: string, system: string) => FakeReply,
): LanguageModel => {
  const model: ModelObject = {
    doGenerate: async ({ prompt }) => {
      await Promise.resolve();
      const answer = reply(messageOf(prompt), systemOf(prompt));
      if ("refusedWith" in answer) {
        throw new APICallError({
          message: "Invalid API key",
          requestBodyValues: {},
          statusCode: answer.refusedWith,
          url: "https://fake.llm/v1",
        });
      }
      if ("rateLimitedFor" in answer) {
        throw new APICallError({
          message: "Rate limit reached",
          requestBodyValues: {},
          responseHeaders: { "retry-after": String(answer.rateLimitedFor) },
          statusCode: 429,
          url: "https://fake.llm/v1",
        });
      }
      return {
        content: [{ text: JSON.stringify(answer), type: "text" }],
        finishReason: { raw: "stop", unified: "stop" },
        usage: USAGE,
        warnings: [],
      };
    },
    doStream: async () => {
      await Promise.resolve();
      throw new Error("The fake parse model does not stream");
    },
    modelId: "fake-parse",
    provider: "fake",
    specificationVersion: "v4",
    supportedUrls: {},
  };
  return model;
};

/** The field the prompt says the message came from. */
const domainOfPrompt = (system: string): RequestDomain =>
  REQUEST_DOMAINS.find((domain) => system.includes(DOMAIN_LINES[domain])) ?? "task";

type Listed = { readonly alias: string; readonly title: string };

const TASK_LINE = /^- (t\d+): (.+)$/u;
/** `- a2: 2026-10-14 07:30–08:30 Label (category)`: the alias and the label. */
const ACTIVITY_LINE = /^- (a\d+): \S+ \S+ (.+) \(\w+\)$/u;

/** The prompt's list lines of tasks (`t3`) or activities (`a2`): each alias and its name. */
const listed = (system: string, prefix: "a" | "t"): readonly Listed[] =>
  system
    .split("\n")
    .map((line) => (prefix === "t" ? TASK_LINE : ACTIVITY_LINE).exec(line))
    .filter((match) => match !== null)
    .map((match) => ({ alias: match[1] ?? "", title: match[2] ?? "" }));

const find = (items: readonly Listed[], name: string): Listed | undefined => {
  const key = name.trim().toLowerCase();
  return (
    items.find((item) => item.title.toLowerCase() === key) ??
    items.find((item) => item.title.toLowerCase().includes(key))
  );
};

/** The prompt's "Now:" line read back into an instant and the account's zone. */
const nowOf = (system: string): { readonly now: string; readonly zone: string } => {
  const match = /^Now: (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}), \w+ \(([^)]+)\)/mu.exec(system);
  const zone = match?.[3] ?? "UTC";
  return {
    now:
      match === null
        ? new Date().toISOString()
        : wallClockInstant(match[1] ?? "", match[2] ?? "", zone),
    zone,
  };
};

type Command = {
  readonly pattern: RegExp;
  readonly read: (match: RegExpExecArray, system: string) => ModelAction | null;
};

const taskAction = (
  system: string,
  name: string,
  action: Partial<ModelAction> & Pick<ModelAction, "kind">,
): ModelAction | null => {
  const task = find(listed(system, "t"), name);
  return task === undefined
    ? null
    : blankModelAction({ ...action, quote: task.title, task: task.alias });
};

const activityAction = (
  system: string,
  name: string,
  action: Partial<ModelAction> & Pick<ModelAction, "kind">,
): ModelAction | null => {
  const activity = find(listed(system, "a"), name);
  return activity === undefined
    ? null
    : blankModelAction({ ...action, activity: activity.alias, quote: activity.title });
};

const list = (text: string): readonly string[] =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

/**
What the fake understands besides a plain message, so tests and e2e can ask for every kind of
action: "delete task <title>", "close task <title>", "rename task <title> to <new>",
"add to <title>: a, b", "solved in <title>: 1, 2", "delete activity <label>",
"rename activity <label> to <new>". Names match the lists in the prompt.
*/
const COMMANDS: readonly Command[] = [
  {
    pattern: /^delete task (.+)$/iu,
    read: (match, system) => taskAction(system, match[1] ?? "", { kind: "task.delete" }),
  },
  {
    pattern: /^close task (.+)$/iu,
    read: (match, system) =>
      taskAction(system, match[1] ?? "", { kind: "task.close", outcome: "done" }),
  },
  {
    pattern: /^rename task (.+) to (.+)$/iu,
    read: (match, system) =>
      taskAction(system, match[1] ?? "", { kind: "task.update", title: match[2] ?? null }),
  },
  {
    pattern: /^add to (.+): (.+)$/iu,
    read: (match, system) =>
      taskAction(system, match[1] ?? "", {
        kind: "task.addSubtasks",
        subtasks: list(match[2] ?? "").map((label) => ({
          label,
          number: /^\d+$/u.test(label) ? Number(label) : null,
        })),
      }),
  },
  {
    pattern: /^solved in (.+): (.+)$/iu,
    read: (match, system) =>
      taskAction(system, match[1] ?? "", {
        kind: "task.markSubtasks",
        subtaskRefs: [...list(match[2] ?? "")],
      }),
  },
  {
    pattern: /^delete activity (.+)$/iu,
    read: (match, system) => activityAction(system, match[1] ?? "", { kind: "activity.delete" }),
  },
  {
    pattern: /^rename activity (.+) to (.+)$/iu,
    read: (match, system) =>
      activityAction(system, match[1] ?? "", { kind: "activity.update", label: match[2] ?? null }),
  },
];

const commandOf = (text: string, system: string): ModelAction | null | undefined => {
  for (const command of COMMANDS) {
    const match = command.pattern.exec(text.trim());
    if (match !== null) {
      return command.read(match, system);
    }
  }
  return undefined;
};

const wall = (at: string, zone: string): string => formatInZone(at, zone, "yyyy-MM-dd HH:mm");

/** Words without a span: started now, a length in them as the Expect. */
const echoStart = (text: string): ModelAction => {
  const typed = typedActivity(text);
  return blankModelAction({
    category: "other",
    evidence: typed.expectMinutes === null ? [] : [{ field: "expectMinutes", quote: text }],
    expectMinutes: typed.expectMinutes,
    kind: "activity.start",
    label: typed.label,
  });
};

/** The plainest reading of an activity: its typed span (over: logged, on: started), else the words. */
const echoActivity = (text: string, system: string): ModelAction => {
  const { now, zone } = nowOf(system);
  const span = typedSpan(text, { now, zone });
  if (span === null) {
    return echoStart(text);
  }
  const isOver = span.endAt <= now;
  return blankModelAction({
    category: "other",
    end: isOver ? wall(span.endAt, zone) : null,
    evidence: [
      { field: "start", quote: text },
      ...(isOver ? [{ field: "end", quote: text } as const] : []),
    ],
    kind: isOver ? "activity.log" : "activity.start",
    label: span.label,
    start: wall(span.startAt, zone),
  });
};

const answer = (
  domain: ParseDomain,
  confidence: number,
  actions: readonly ModelAction[],
): ModelOutput => ({
  actions: [...actions],
  confidence,
  domain,
  questions: [],
});

/** How sure the fake is of its own guess at the domain: sure only of commands and spans. */
const SURE = 0.95;
const UNSURE = 0.6;

/** A command's answer: sure of the domain its kind belongs to when asked to decide. */
const commandAnswer = (command: ModelAction | null, domain: RequestDomain): ModelOutput => {
  const actions = command === null ? [] : [command];
  if (domain !== "auto") {
    return answer(domain, 1, actions);
  }
  return answer(
    command?.kind.startsWith("activity.") === true ? "activity" : "task",
    SURE,
    actions,
  );
};

/** Asked to decide: sure of a time span (an activity), only guessing a task otherwise. */
const decided = (text: string, system: string): ModelOutput => {
  const { now, zone } = nowOf(system);
  return typedSpan(text, { now, zone }) === null
    ? answer("task", UNSURE, [echoTask(text)])
    : answer("activity", SURE, [echoActivity(text, system)]);
};

/**
The fake's reading: a command (see `COMMANDS`) as that action; otherwise, by the field the
prompt names, a new task titled with the message, or the activity its words and time span say.
*/
export const echoReply = (text: string, system: string): ModelOutput => {
  const domain = domainOfPrompt(system);
  const command = commandOf(text, system);
  if (command !== undefined) {
    return commandAnswer(command, domain);
  }
  if (domain === "auto") {
    return decided(text, system);
  }
  return domain === "task"
    ? answer("task", 1, [echoTask(text)])
    : answer("activity", 1, [echoActivity(text, system)]);
};

/** One new task titled with the message itself. */
const echoTask = (text: string): ModelAction =>
  blankModelAction({ kind: "task.create", title: text.trim() });

/** The plainest answer to any prompt: one new task titled with the message. */
export const echoParse = (text: string): ModelOutput => answer("task", 1, [echoTask(text)]);
