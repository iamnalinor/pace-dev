import { Elysia, t } from "elysia";

export const createHealthRoutes = (deps: { readonly checkDatabase: () => Promise<boolean> }) =>
  new Elysia({ prefix: "/health" })
    // Liveness: the process is up and serving HTTP.
    .get("/", () => ({ status: "ok" as const }), {
      response: { 200: t.Object({ status: t.Literal("ok") }) },
    })
    // Readiness: dependencies are reachable; load balancers route traffic only when ready.
    .get(
      "/ready",
      async ({ status }) =>
        (await deps.checkDatabase())
          ? { status: "ready" as const }
          : status(503, { status: "unavailable" as const }),
      {
        response: {
          200: t.Object({ status: t.Literal("ready") }),
          503: t.Object({ status: t.Literal("unavailable") }),
        },
      },
    );
