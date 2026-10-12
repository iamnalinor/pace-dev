import type { Context } from "hono";

import type { UserStore } from "../user-store/user-store.ts";
import type { AppEnv } from "./app-env.ts";

import { requireUser } from "./current-user.ts";

/** The signed-in person's Durable Object, for a route to call. */
export const userStoreOf = (c: Context<AppEnv>): DurableObjectStub<UserStore> =>
  c.env.USER_STORE.get(c.env.USER_STORE.idFromName(requireUser(c).id));
