import { z } from "zod";

import { loosen } from "./loose.ts";

/*
Reading a server's answer when a newer server may say something this client has no word for (a
new kind of notification, a new push method, a new result): those parts are dropped or stood in
for, never a reason to refuse the whole answer. What is known is read loosened (`loosen`).
*/

/** Reads any value into `Out`. */
type Reading<In extends z.ZodType, Out> = z.ZodPipe<In, z.ZodTransform<Out, z.output<In>>>;

/** A list whose entries this client does not know (or cannot read) are dropped; the rest kept. */
export const knownValues = <T extends z.ZodType>(
  element: T,
): Reading<z.ZodArray<z.ZodUnknown>, z.output<T>[]> => {
  const known = loosen(element);
  return z.array(z.unknown()).transform((entries): z.output<T>[] =>
    entries.flatMap((entry) => {
      const parsed = known.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    }),
  );
};

/**
The value when this client knows it, `null` when it does not, or there is none: an older server
that does not send the key at all reads as `null` too.
*/
export const knownOrNull = <T extends z.ZodType>(
  schema: T,
): Reading<z.ZodOptional<z.ZodUnknown>, null | z.output<T>> => {
  const known = loosen(schema);
  return z
    .unknown()
    .optional()
    .transform((value): null | z.output<T> => {
      const parsed = known.safeParse(value);
      return parsed.success ? parsed.data : null;
    });
};

/** One of `values`; a value a newer server added reads as `fallback`. */
export const knownValue = <const V extends string>(
  values: readonly V[],
  fallback: NoInfer<V>,
): Reading<z.ZodString, V> =>
  z
    .string()
    .transform(
      (value): V => ((values as readonly string[]).includes(value) ? (value as V) : fallback),
    );
