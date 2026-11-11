import { config } from "zod";

/*
The web build runs under a CSP without 'unsafe-eval' (`public/_headers`). Zod compiles its object
parsers with `new Function` after probing for it once; the probe is caught, but the browser still
reports a `securitypolicyviolation` (and logs an error) on every load (web-baseline.e2e.ts). Zod's
plain parsers do the same work without it. Imported first by `entry.ts`, before any schema parses.
*/
config({ jitless: true });
