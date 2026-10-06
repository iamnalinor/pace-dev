import { AuthForm } from "./auth-form.tsx";
import { GuestOnly } from "./require-auth.tsx";

export const SignInPage = () => (
  <GuestOnly>
    <AuthForm mode="sign-in" />
  </GuestOnly>
);
