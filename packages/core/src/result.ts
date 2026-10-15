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

/** Every item's values in order, or the first failure: items after it are not looked at. */
export const collectAll = <I, T, E>(
  items: readonly I[],
  step: (item: I) => Result<readonly T[], E>,
): Result<readonly T[], E> => {
  const [first, ...rest] = items;
  if (first === undefined) {
    return ok([]);
  }
  const head = step(first);
  if (!head.ok) {
    return head;
  }
  const tail = collectAll(rest, step);
  return tail.ok ? ok([...head.value, ...tail.value]) : tail;
};
