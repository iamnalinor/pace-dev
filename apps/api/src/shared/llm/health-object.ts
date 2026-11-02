import { DurableObject } from "cloudflare:workers";

import type { Health, Verdict } from "./health.ts";

import { createHealthKeeper, type HealthKeeper } from "./health-keeper.ts";

/**
The providers' health shared by every user and isolate: one small Durable Object for the
deployment (`idFromName("global")`, see `objectHealth`). One writer, so two records sent at once
both count; its storage is written only when who is asked first changes (bug class 97).
*/
export class LlmHealth extends DurableObject {
  readonly #keeper: HealthKeeper;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.#keeper = createHealthKeeper(ctx.storage);
  }

  async read(): Promise<Health> {
    return await this.#keeper.read();
  }

  /** Applies a read's verdicts; the health after them. Rejects when storage fails. */
  async record(verdicts: readonly Verdict[], now: string): Promise<Health> {
    const { health } = await this.#keeper.record(verdicts, now);
    return health;
  }
}
