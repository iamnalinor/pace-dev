import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { createLogger } from "./logger.ts";

describe("createLogger", () => {
  const stdout = spyOn(console, "log").mockImplementation(() => undefined);
  const stderr = spyOn(console, "error").mockImplementation(() => undefined);
  afterEach(() => {
    stdout.mockClear();
    stderr.mockClear();
  });

  test("drops messages below the configured level", () => {
    const logger = createLogger("info");

    logger.debug("noise");
    logger.info("kept");

    expect(stdout).toHaveBeenCalledTimes(1);
  });

  test("writes one JSON line per entry; errors go to stderr", () => {
    createLogger("debug").error("boom", { requestId: "r1" });

    expect(stdout).not.toHaveBeenCalled();
    const line: unknown = stderr.mock.calls[0]?.[0];
    expect(JSON.parse(String(line))).toEqual({
      level: "error",
      message: "boom",
      requestId: "r1",
      time: expect.any(String) as string,
    });
  });
});
