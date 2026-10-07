import { isRouteErrorResponse, Link, useLocation, useRouteError } from "react-router";

import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";

type Described = {
  readonly headline: string;
  /** The error's own words: status line or message. */
  readonly reason: string;
  /** Stack or response body, for the collapsed details. */
  readonly details: null | string;
};

const describe = (error: unknown): Omit<Described, "headline"> => {
  if (isRouteErrorResponse(error)) {
    const body = typeof error.data === "string" ? error.data : JSON.stringify(error.data);
    return { details: body === "" ? null : body, reason: `${error.status} ${error.statusText}` };
  }
  return error instanceof Error ? { details: error.stack ?? null, reason: `${error.name}: ${error.message}` } : { details: null, reason: String(error) };
};

/** A screen that failed to render: says what failed, offers a reload and a way home. */
export const RouteError = () => {
  const t = useT();
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }
  const { details, reason } = describe(error);
  return (
    <main className="mx-auto grid max-w-xl gap-4 p-8" role="alert">
      <h1 className="text-2xl font-semibold">{t("errors.crashTitle")}</h1>
      <p className="text-sm text-muted">{t("errors.crashBody")}</p>
      <p className="rounded-md bg-surface p-3 font-mono text-sm wrap-break-word text-warn">{reason}</p>
      {details !== null && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">{t("errors.details")}</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{details}</pre>
        </details>
      )}
      <div className="flex gap-2">
        <Button
          onClick={() => {
            globalThis.location.reload();
          }}
        >
          {t("errors.reload")}
        </Button>
        <Button asChild variant="outline">
          <Link to="/">{t("common.home")}</Link>
        </Button>
      </div>
    </main>
  );
};

/** An address the app has no screen for. */
export const NotFoundPage = () => {
  const t = useT();
  const { pathname } = useLocation();
  return (
    <main className="mx-auto grid max-w-xl gap-4 p-8">
      <h1 className="text-2xl font-semibold">{t("errors.pageNotFound")}</h1>
      <p className="text-sm text-muted">{t("errors.pageNotFoundBody", { path: pathname })}</p>
      <div>
        <Button asChild variant="outline">
          <Link to="/">{t("common.home")}</Link>
        </Button>
      </div>
    </main>
  );
};
