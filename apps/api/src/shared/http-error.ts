import { t } from "elysia";

/** Body of every error response: a stable machine-readable `code` and a human message. */
export const HttpErrorSchema = t.Object({ code: t.String(), message: t.String() });
