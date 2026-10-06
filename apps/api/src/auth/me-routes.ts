import { Elysia, t } from "elysia";

import type { AuthMacro } from "./auth-plugin.ts";

import { HttpErrorSchema } from "../shared/http-error.ts";

/** GET /api/me — the signed-in user. The smallest protected route. */
export const createMeRoutes = (deps: { readonly authMacro: AuthMacro }) =>
  new Elysia().use(deps.authMacro).get("/me", ({ user }) => user, {
    auth: true,
    response: {
      200: t.Object({ email: t.String(), id: t.String(), name: t.String() }),
      401: HttpErrorSchema,
    },
  });
