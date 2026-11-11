/**
Cloudflare's `_headers` file, read the way the assets worker applies it: a path rule on its own
line (`/*`, `/.well-known/*`), its `Name: value` lines indented under it. Shared by the local web
server (`serve-web.ts`), so the e2e run sees the production headers, CSP included (F-WEB-16), and by
`web-headers.test.ts`.
*/
export type HeaderRule = {
  readonly path: string;
  readonly headers: ReadonlyMap<string, string>;
};

export const parseHeaders = (source: string): readonly HeaderRule[] => {
  const rules: { path: string; headers: Map<string, string> }[] = [];
  for (const line of source.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }
    if (!line.startsWith(" ") && !line.startsWith("\t")) {
      rules.push({ headers: new Map(), path: line.trim() });
      continue;
    }
    const at = line.indexOf(":");
    rules.at(-1)?.headers.set(line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim());
  }
  return rules;
};

/** A rule's path matches exactly, or as a prefix where it ends in `*`. */
const isMatch = (rule: string, path: string): boolean =>
  rule.endsWith("*") ? path.startsWith(rule.slice(0, -1)) : rule === path;

/** Every header the rules give a path; a later rule's value replaces an earlier one's. */
export const headersForPath = (
  rules: readonly HeaderRule[],
  path: string,
): ReadonlyMap<string, string> =>
  new Map(rules.filter((rule) => isMatch(rule.path, path)).flatMap((rule) => [...rule.headers]));

/**
The CSP with a local API allowed in `connect-src` (HTTP and its socket): the committed policy names
the production API, and the local build talks to `localhost`. Nothing else is loosened.
*/
export const withLocalApi = (policy: string, apiOrigin: string | undefined): string => {
  if (apiOrigin === undefined || apiOrigin === "") {
    return policy;
  }
  const socket = apiOrigin.replace(/^http/u, "ws");
  return policy
    .split(";")
    .map((directive) =>
      directive.trim().startsWith("connect-src ")
        ? `${directive.trimEnd()} ${apiOrigin} ${socket}`
        : directive,
    )
    .join(";");
};
