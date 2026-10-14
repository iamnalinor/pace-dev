import type { z } from "zod";

/** A schema's definition, read generically: its kind and the parts that hold other schemas. */
type Def = Readonly<Record<string, unknown>> & { readonly type: string };

const defOf = (schema: z.ZodType): Def => schema._zod.def as unknown as Def;

const loosenAll = (schemas: readonly z.ZodType[]): readonly z.ZodType[] =>
  schemas.map((schema) => loosenAny(schema));

/** The same schema with every object at every depth dropping unknown keys. */
const loosenAny = (schema: z.ZodType): z.ZodType => {
  const def = defOf(schema);
  const child = (key: string): z.ZodType => loosenAny(def[key] as z.ZodType);
  switch (def.type) {
    case "object": {
      const shape = def["shape"] as Readonly<Record<string, z.ZodType>>;
      const loose = Object.fromEntries(
        Object.entries(shape).map(([key, value]) => [key, loosenAny(value)]),
      );
      // No catchall: unknown keys are stripped, as `z.object` does.
      return schema.clone({ ...def, catchall: undefined, shape: loose } as never);
    }
    case "array": {
      return schema.clone({ ...def, element: child("element") } as never);
    }
    case "union": {
      return schema.clone({ ...def, options: loosenAll(def["options"] as z.ZodType[]) } as never);
    }
    case "pipe": {
      return schema.clone({ ...def, in: child("in"), out: child("out") } as never);
    }
    case "default":
    case "nullable":
    case "optional":
    case "readonly": {
      return schema.clone({ ...def, innerType: child("innerType") } as never);
    }
    default: {
      return schema;
    }
  }
};

/**
What a server answers, read so that a newer server never breaks an older client: every object
in it, at any depth, drops the keys it does not know instead of refusing them. Every other check
stays. What a client sends stays as strict as it was written (`endpoint` loosens outputs only).
*/
export const loosen = <T extends z.ZodType>(schema: T): T => loosenAny(schema) as T;
