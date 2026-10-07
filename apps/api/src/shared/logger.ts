type Level = "debug" | "error" | "info" | "warn";

export type Logger = Readonly<Record<Level, (message: string, context?: object) => void>>;

const SEVERITY: Readonly<Record<Level, number>> = { debug: 0, error: 3, info: 1, warn: 2 };

// Workers Logs derives its own level from the console method, so each level has its sink.
const SINK: Readonly<Record<Level, (line: string) => void>> = {
  debug: (line) => {
    console.log(line);
  },
  error: (line) => {
    console.error(line);
  },
  info: (line) => {
    console.log(line);
  },
  warn: (line) => {
    console.warn(line);
  },
};

/** Structured JSON logs (Workers Logs indexes the fields) — the only place allowed to use `console`. */
export const createLogger = (minLevel: Level): Logger => {
  const log =
    (level: Level) =>
    (message: string, context: object = {}): void => {
      if (SEVERITY[level] < SEVERITY[minLevel]) {
        return;
      }
      SINK[level](JSON.stringify({ level, message, time: new Date().toISOString(), ...context }));
    };
  return { debug: log("debug"), error: log("error"), info: log("info"), warn: log("warn") };
};
