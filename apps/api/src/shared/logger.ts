type Level = "debug" | "error" | "info";

export type Logger = Readonly<Record<Level, (message: string, context?: object) => void>>;

const SEVERITY: Readonly<Record<Level, number>> = { debug: 0, error: 2, info: 1 };

/** Structured JSON logs (Workers Logs indexes the fields) — the only place allowed to use `console`. */
export const createLogger = (minLevel: Level): Logger => {
  const log =
    (level: Level) =>
    (message: string, context: object = {}): void => {
      if (SEVERITY[level] < SEVERITY[minLevel]) {
        return;
      }
      const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...context });
      if (level === "error") {
        console.error(line);
      } else {
        console.log(line);
      }
    };
  return { debug: log("debug"), error: log("error"), info: log("info") };
};
