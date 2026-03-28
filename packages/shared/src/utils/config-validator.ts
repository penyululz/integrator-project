import { z } from "zod";

export type ConfigValidationResult = {
  valid: boolean;
  errors?: string[];
};

export function validateConfigWithSchema(
  schema: z.ZodTypeAny,
  input: unknown,
): ConfigValidationResult {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => issue.message),
    };
  }

  return {
    valid: true,
  };
}

