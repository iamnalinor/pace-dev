import { DurableObject } from "cloudflare:workers";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import migrations from "../../drizzle/do/migrations.js";
import * as schema from "./schema.ts";

/**
 * One instance per user (id = user id): the event log, projections, decisions and
 * alarms. Migrations run before the first request touches storage.
 */
export class UserStore extends DurableObject {
  readonly db: DrizzleSqliteDODatabase<typeof schema>;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { casing: "snake_case", schema });
    // eslint-disable-next-line sonarjs/no-async-constructor -- blockConcurrencyWhile is the documented way to migrate before the first request
    void ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

  /** Smoke check used by tests: the schema is in place. */
  async countEvents(): Promise<number> {
    const rows = await this.db.select({ seq: schema.events.seq }).from(schema.events);
    return rows.length;
  }
}
