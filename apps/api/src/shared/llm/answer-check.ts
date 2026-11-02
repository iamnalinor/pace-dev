import type { z } from "zod";

import { jsonSchema, type JSONSchema7, type Schema, zodSchema } from "ai";

import { createLogger } from "../logger.ts";
import { clampToJsonSchema, fillAbsent, lenientJsonSchema } from "./schema-fit.ts";

const log = createLogger("info");

/**
What a model's answer must pass, the one check for every way an answer arrives (the stream, or an
endpoint's refusal that carries it, bug class 85): the nullable keys an action left out filled as
"does not apply" (never a list, bug class 95), the values clamped to the limits, then all of
`schema`.
*/
export type AnswerCheck<T> = {
  /** What the model is shown: the schema without length limits, its answer checked by `check`. */
  readonly shown: Schema<T>;
  readonly check: (value: unknown) => Promise<z.ZodSafeParseResult<T>>;
};

export const answerCheck = <T>(schema: z.ZodType<T>): AnswerCheck<T> => {
  const strict = zodSchema(schema).jsonSchema;
  const check = async (value: unknown): Promise<z.ZodSafeParseResult<T>> => {
    const filled = fillAbsent(value, await strict);
    const clamped = clampToJsonSchema(filled, await strict);
    if (JSON.stringify(filled) !== JSON.stringify(value)) {
      log.info("llm: nullable keys an action left out read as null");
    }
    if (JSON.stringify(clamped) !== JSON.stringify(filled)) {
      log.info("llm: answer cut to the schema's limits");
    }
    return schema.safeParse(clamped);
  };
  const shown = jsonSchema<T>(async () => lenientJsonSchema(await strict) as JSONSchema7, {
    validate: async (value) => {
      const parsed = await check(value);
      return parsed.success
        ? { success: true, value: parsed.data }
        : { error: parsed.error, success: false };
    },
  });
  return { check, shown };
};

/** A text's JSON value; `undefined` when it is not JSON (the check then refuses it). */
export const parsedJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
