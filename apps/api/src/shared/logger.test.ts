import { afterEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "./logger.ts";

describe("createLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes one JSON line per call with level, message, time and context", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    createLogger("info").info("hello", { requestId: "r1" });
    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(log.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(line).toMatchObject({ level: "info", message: "hello", requestId: "r1" });
    expect(typeof line["time"]).toBe("string");
  });

  it("sends errors to stderr and drops messages below the minimum level", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logger = createLogger("error");
    logger.debug("quiet");
    logger.info("quiet too");
    logger.error("loud");
    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("sends warnings to console.warn and ranks them above info", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logger = createLogger("warn");
    logger.info("quiet");
    logger.warn("careful", { ip: "8.8.8.8" });
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse(warn.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(line).toMatchObject({ level: "warn", message: "careful", ip: "8.8.8.8" });
  });
});
