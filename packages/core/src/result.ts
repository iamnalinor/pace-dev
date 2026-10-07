/**
Explicit, typed success/failure. Domain code returns a `Result` instead of
throwing, so every failure is visible in the signature and callers are forced
(by `switch-exhaustiveness-check`) to handle each one.
*/
export type Result<T, E> = Err<E> | Ok<T>;

type Ok<T> = { readonly ok: true; readonly value: T };
type Err<E> = { readonly error: E; readonly ok: false };

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = <E>(error: E): Err<E> => ({ error, ok: false });
