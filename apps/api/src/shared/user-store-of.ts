import type { Context } from "hono";

import type { AppEnv } from "./app-env.ts";
import type { AppBindings } from "./ports/bindings.ts";
import type { UserStoreRpc } from "./ports/user-store-host.ts";

import { requireUser } from "./current-user.ts";

/** A person's Durable Object by their id (a route that signs them in has no current user yet). */
export const storeOfUser = (env: AppBindings, userId: string): UserStoreRpc =>
  env.USER_STORE.of(userId);

/** The signed-in person's Durable Object, for a route to call. */
export const userStoreOf = (c: Context<AppEnv>): UserStoreRpc =>
  storeOfUser(c.env, requireUser(c).id);
