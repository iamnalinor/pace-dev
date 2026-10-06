import { isRouteErrorResponse, Link, useRouteError } from "react-router";

/** Last-resort error screen for rendering errors and unknown routes. */
export const RouteError = () => {
  const error = useRouteError();
  const title =
    isRouteErrorResponse(error) && error.status === 404 ? "Page not found" : "Something went wrong";
  return (
    <div className="grid gap-4 p-8 text-center" role="alert">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Link className="underline" to="/">
        Go home
      </Link>
    </div>
  );
};
