import { z } from "zod";

import { endpoint } from "./endpoint.ts";

/** The whole HTTP contract of the Pace API. Add an endpoint here, mount it in apps/api, call it from @pace/client. */
export const endpoints = {
  health: endpoint({
    auth: false,
    method: "GET",
    output: z.object({ status: z.literal("ok") }),
    path: "/api/health",
  }),
} as const;
