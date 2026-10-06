# Architecture

## The big picture

```
Browser ──► web (React SPA) ──/api──► api (Elysia) ──► PostgreSQL
              │                         │
              └── Eden client ◄── type App (import type only)
```

- **One origin.** The browser only ever talks to the origin that served the page. In
  development Vite proxies `/api`, in production nginx does. There is no CORS config
  and the session cookie is a plain `HttpOnly; SameSite=Lax` first-party cookie.
- **One contract.** The web app imports `type App` from `@template/api` and builds a
  typed client with Eden. Changing a route's schema in the API is a compile error in
  the web app until it is updated. Only `import type` is allowed across that boundary
  (dependency-cruiser rule `web-imports-api-types-only`), so no server code ever
  ships to the browser.

## API: Clean Architecture per feature

Each feature is a folder with four layers. Dependencies point **inward only**:

```
features/example-posts/
  domain/           business rules: pure functions and types. No I/O, no frameworks.
  application/      use cases + ports (interfaces they need, e.g. a repository).
  infrastructure/   adapters implementing the ports: Drizzle tables and repository.
  http/             Elysia routes: validate input, call a use case, map the result.
  example-posts-feature.ts   composition root of the feature (the only file that knows all layers)
```

| Layer | May import | Enforced by |
|---|---|---|
| domain | its own domain, `shared/result` | depcruise `domain-is-pure` |
| application | domain, `shared/{result,clock}`, `auth/current-user` | depcruise `application-depends-on-domain-only` |
| infrastructure | application (ports), domain, `shared/db` — never `http` | depcruise `infrastructure-does-not-know-http` |
| http | application, domain, auth macro, shared — never `infrastructure` | depcruise `http-does-not-know-infrastructure` |
| any feature | never another feature | depcruise `features-are-isolated` |

`domain/` and `application/` are additionally **functional**: no `let`, no mutation, no
classes, no `throw` (eslint-plugin-functional).

### Errors are values

Use cases return `Result<T, E>` (`shared/result.ts`), where `E` is a union of string
literals such as `"example-post/not-found" | "example-post/forbidden"`. The HTTP layer
maps each one to a status with a `switch` that has **no `default`**: adding a new error
to the union without handling it fails `switch-exhaustiveness-check`. Exceptions are
reserved for the truly unexpected; they become a generic `500` (never leaking a stack
or SQL) and are logged by the global `onError` in `app.ts`.

### Dependency injection without a container

Use cases are factories: `makeCreateExamplePost({ repository, clock })` returns the
function that does the work. Tests pass fakes (`*.fake.ts`), production passes
Drizzle adapters. The wiring is plain code in `*-feature.ts` and `app.ts`; `main.ts`
reads the configuration, runs migrations and starts the server.

### Auth

better-auth owns `/api/auth/*` (sign-up, sign-in, sign-out, sessions). Sessions live in
the database (revocable, unlike JWTs) and the browser holds only an `HttpOnly` cookie.
A route opts into authentication with `{ auth: true }` (an Elysia macro in
`auth/auth-plugin.ts`) and receives `user: CurrentUser`. The application layer only
knows `CurrentUser`, never better-auth. `GET /api/me` (`auth/me-routes.ts`) is the
smallest protected route and part of the base template.

better-auth's generated tables use `timestamp` **without** time zone, and the Postgres
driver interprets those in the process time zone. Every script and the Docker image
therefore run the API with `TZ=UTC`; keep it that way (or session expiry shifts by
your UTC offset).

To add email verification or password reset, configure an email sender in
`auth/auth.ts` ([docs](https://www.better-auth.com/docs/authentication/email-password)).
Other better-auth plugins (OAuth, 2FA, …) may add tables: regenerate
`auth/auth-schema.ts` with `bunx auth@<version> generate` and then `bun db:generate`.

### Elysia pitfalls this template already handles

- **Route options must not be shared objects.** Elysia mutates a route's options object
  (it stores resolved macro hooks on it). Two app instances sharing a module-level
  `const options = {...}` means the second runs the first one's hooks. Use a factory
  (`const listRouteOptions = () => ({...})`).
- **Keep route definitions chained** (`new Elysia().get(...).post(...)`): Eden infers
  the client from the chained type.
- **Eden `parseDate: false`.** By default Eden turns *any* date-looking string into a
  `Date` — including user content — while the type still says `string`.

## Web

```
src/
  main.tsx            providers (TanStack Query, router, toasts)
  router.tsx          routes; guards RequireAuth / GuestOnly
  features/<name>/    pages, components, queries (TanStack Query over Eden), tests
  shared/
    api/              Eden client, `unwrap` (Eden result → value or ApiError), query client
    auth/             better-auth client
    ui/               shadcn/ui components (vendored, generated by `shadcn add`)
```

- Server state lives in TanStack Query, never copied into component state.
- `unwrap()` is the single bridge from Eden's `{ data, error }` to TanStack Query's
  value-or-throw.
- Mutations with visible latency are optimistic with rollback (see `useToggleExampleLike`).
- Web features do not import each other either (`web-features-are-isolated`).
- Imports inside the web app use the `#web/*` alias (package.json `imports`), not
  tsconfig `paths`: the web project also type-checks API sources for Eden, and a
  `paths` alias would leak into them.

## How to add a feature

The example feature is the reference. For a feature `bookmarks`:

1. **Domain** — `apps/api/src/features/bookmarks/domain/`: types, validation and rules as
   pure functions returning `Result`. Unit-test what is non-trivial.
2. **Application** — `application/`: the repository port (a `type` with the operations
   you need) and one file per use case (`make<UseCase>(deps) => (input) => Result`).
   Unit-test branching logic against a `*.fake.ts` repository.
3. **Infrastructure** — `infrastructure/`: Drizzle tables (`bookmarks-table.ts`) and the
   repository implementing the port. Export the tables from `shared/db/schema.ts`, then
   `bun db:generate --name=bookmarks` and review the SQL.
4. **HTTP** — `http/`: TypeBox schemas for params/query/body **and every response
   status**, routes with `{ auth: true }` where needed, exhaustive error mapping.
5. **Wire it** — `bookmarks-feature.ts` builds repository → use cases → routes;
   `app.ts` adds `.use(createBookmarksFeature(...))` inside the `/api` group.
6. **Integration tests** — `apps/api/tests/integration/bookmarks.int.test.ts` through
   the Eden client: happy path, validation, authorization, races if any.
7. **Web** — `apps/web/src/features/bookmarks/`: queries (`unwrap(api.bookmarks.get())`),
   components, a page; add the route in `router.tsx`. Component tests for logic only.
8. **E2E** — one Playwright scenario for the main user journey, with an axe check.
9. `bun lint && bun test`.
