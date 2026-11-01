import type { Context } from "hono";

import type { UserStore } from "../user-store/user-store.ts";
import type { AppEnv } from "./app-env.ts";

import { requireUser } from "./current-user.ts";

/** A person's Durable Object by their id (a route that signs them in has no current user yet). */
export const storeOfUser = (env: Cloudflare.Env, userId: string): DurableObjectStub<UserStore> =>
  env.USER_STORE.get(env.USER_STORE.idFromName(userId));

/** The signed-in person's Durable Object, for a route to call. */
export const userStoreOf = (c: Context<AppEnv>): DurableObjectStub<UserStore> =>
  storeOfUser(c.env, requireUser(c).id);
