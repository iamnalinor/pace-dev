// Creates the e2e database if it does not exist yet (the API then migrates it).
// Bun's built-in SQL client: no extra dependency for a one-off admin query.
import { SQL } from "bun";

const url = new URL(Bun.env["DATABASE_URL"] ?? "");
const name = url.pathname.slice(1);
url.pathname = "/postgres";

const admin = new SQL(url.href);
const existing: unknown[] = await admin`select 1 from pg_database where datname = ${name}`;
if (existing.length === 0) {
  await admin.unsafe(`create database "${name.replaceAll('"', '""')}"`);
}
await admin.close();
