import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { meterSql } from "./helpers.ts";

const freshStore = () => env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));

/** A statement the meter counts as a whole-log load. */
const LOAD = 'select "seq" from "events" order by "seq"';

describe("the SQL meter of the cost tests", () => {
  it("puts sql.exec back: a restored meter counts nothing more, and the next counts alone", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      const execOf = (): unknown => Reflect.get(storage.sql, "exec");
      const exec = execOf();
      const first = meterSql(storage);
      storage.sql.exec(LOAD);
      first.restore();
      expect(execOf()).toBe(exec);
      const second = meterSql(storage);
      storage.sql.exec(LOAD);
      second.restore();
      expect(first.cost().loads).toBe(1);
      expect(second.cost().loads).toBe(1);
      expect(execOf()).toBe(exec);
    });
  });
});
