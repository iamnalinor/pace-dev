import { isRouteErrorResponse, Link, useRouteError } from "react-router";

import { useT } from "#web/i18n.tsx";

/** Last-resort error screen for rendering errors and unknown routes. */
export const RouteError = () => {
  const t = useT();
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div className="grid gap-4 p-8 text-center" role="alert">
      <h1 className="text-2xl font-semibold">
        {t(isNotFound ? "errors.pageNotFound" : "errors.generic")}
      </h1>
      <Link className="text-accentText underline" to="/">
        {t("common.home")}
      </Link>
    </div>
  );
};
