import { z } from "zod";

/*
The MCP apps' grants, read and revoked straight from OAUTH_KV in the layout
@cloudflare/workers-oauth-provider keeps them (`grant:<user>:<grant>`, its tokens under
`token:<user>:<grant>:`), so the sessions list and the bot reach them without the provider's
per-request helpers. tests/sessions.int.test.ts holds this to the provider: a revoked grant's
token is refused at `/mcp`.
*/

/** An MCP app holding access to the account, as Settings shows it. */
export type Grant = {
  readonly id: string;
  /** The app's own name, as consent stored it; its client id when it named none. */
  readonly clientName: string;
  readonly scopes: readonly string[];
  /** Milliseconds since the epoch. */
  readonly createdAt: number;
};

/** What consent stores on a grant (oauth-routes.ts): the app's name is read back from it here. */
export type GrantMetadata = {
  readonly label: string;
  readonly logoUri?: string | undefined;
  readonly telegramId: string;
};

/** The parts of a stored grant read here; the provider keeps more. */
const StoredGrantSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  scope: z.array(z.string()),
  /** Seconds since the epoch. */
  createdAt: z.number(),
  /** `GrantMetadata`; a grant stored without a readable one is named by its client id. */
  metadata: z.object({ label: z.string().optional() }).catch({}).optional(),
});

const grantPrefix = (userId: string): string => `grant:${userId}:`;

/** Every key under `prefix`, page after page. */
const keysUnder = async (
  kv: KVNamespace,
  prefix: string,
  cursor?: string,
): Promise<readonly string[]> => {
  const page = await kv.list({ prefix, ...(cursor !== undefined && { cursor }) });
  const names = page.keys.map((key) => key.name);
  return page.list_complete ? names : [...names, ...(await keysUnder(kv, prefix, page.cursor))];
};

/** The person's grants; one the provider stored in another shape is skipped. */
export const listGrants = async (kv: KVNamespace, userId: string): Promise<readonly Grant[]> => {
  const prefix = grantPrefix(userId);
  // A grant key holds no further colon after the prefix; anything deeper is not a grant.
  const keys = await keysUnder(kv, prefix);
  const names = keys.filter((name) => !name.slice(prefix.length).includes(":"));
  const stored = await Promise.all(
    names.map(async (name) => StoredGrantSchema.safeParse(await kv.get(name, "json")).data),
  );
  return stored
    .filter((grant) => grant !== undefined)
    .map((grant) => ({
      clientName: grant.metadata?.label ?? grant.clientId,
      createdAt: grant.createdAt * 1000,
      id: grant.id,
      scopes: grant.scope,
    }));
};

/**
Revokes one of the person's grants with all its tokens, as the provider's `revokeGrant` does;
false when they hold no such grant (already revoked, or not theirs).
*/
// eslint-disable-next-line unicorn/consistent-boolean-name -- an action that reports whether a grant went, like deleteSession
export const revokeGrant = async (
  kv: KVNamespace,
  userId: string,
  grantId: string,
): Promise<boolean> => {
  const grantKey = `${grantPrefix(userId)}${grantId}`;
  if (grantId === "" || grantId.includes(":") || (await kv.get(grantKey)) === null) {
    return false;
  }
  const tokens = await keysUnder(kv, `token:${userId}:${grantId}:`);
  await Promise.all(
    tokens.map(async (name) => {
      await kv.delete(name);
    }),
  );
  await kv.delete(grantKey);
  return true;
};
