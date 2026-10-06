import { AuthForm } from "./auth-form.tsx";
import { GuestOnly } from "./require-auth.tsx";

export const SignUpPage = () => (
  <GuestOnly>
    <AuthForm mode="sign-up" />
  </GuestOnly>
);
