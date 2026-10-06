import { type SubmitEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { authClient } from "#web/shared/auth/auth-client.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#web/shared/ui/card.tsx";
import { Input } from "#web/shared/ui/input.tsx";
import { Label } from "#web/shared/ui/label.tsx";

import { safeRedirectPath } from "./safe-redirect.ts";

type Mode = "sign-in" | "sign-up";

type Copy = { alternative: string; description: string; submit: string; title: string };

const COPY: Readonly<Record<Mode, Copy>> = {
  "sign-in": {
    alternative: "No account? Sign up",
    description: "Sign in with your email and password",
    submit: "Sign in",
    title: "Welcome back",
  },
  "sign-up": {
    alternative: "Have an account? Sign in",
    description: "It takes a few seconds",
    submit: "Create account",
    title: "Create an account",
  },
};

const MIN_PASSWORD_LENGTH = 8;

const textField = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

const submitCredentials = async (mode: Mode, form: FormData) => {
  const email = textField(form, "email");
  const password = textField(form, "password");
  return mode === "sign-in"
    ? await authClient.signIn.email({ email, password })
    : await authClient.signUp.email({ email, name: textField(form, "name"), password });
};

export const AuthForm = ({ mode }: { readonly mode: Mode }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const copy = COPY[mode];

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    setError(undefined);
    const result = await submitCredentials(mode, new FormData(event.currentTarget));
    setIsPending(false);
    if (result.error === null) {
      await navigate(safeRedirectPath(searchParams.get("next")), { replace: true });
    } else {
      setError(result.error.message ?? "Something went wrong");
    }
  };

  return (
    <Card className="mx-auto mt-16 w-full max-w-sm">
      <CardHeader>
        <CardTitle>
          <h1>{copy.title}</h1>
        </CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit}>
          {mode === "sign-up" && (
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input autoComplete="name" id="name" name="name" required />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input autoComplete="email" id="email" name="email" required type="email" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              id="password"
              minLength={MIN_PASSWORD_LENGTH}
              name="password"
              required
              type="password"
            />
          </div>
          {error !== undefined && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button disabled={isPending} type="submit">
            {copy.submit}
          </Button>
          <Button asChild variant="link">
            <Link to={mode === "sign-in" ? "/sign-up" : "/sign-in"}>{copy.alternative}</Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
