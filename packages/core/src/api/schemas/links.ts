import { z } from "zod";

import { isHttpUrl } from "../../links.ts";

export const LinkPreviewQuerySchema = z.object({
  url: z.string().max(2048).refine(isHttpUrl, { message: "Expected an http(s) address" }),
});

/** What a link chip shows: the page title and icon when the page could be read. */
export const LinkPreviewSchema = z.object({
  url: z.string(),
  host: z.string(),
  title: z.string().nullable(),
  icon: z.string().nullable(),
});

export type LinkPreview = z.output<typeof LinkPreviewSchema>;
