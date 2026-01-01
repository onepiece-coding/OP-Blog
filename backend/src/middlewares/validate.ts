import type { RequestHandler } from 'express';
import createError from 'http-errors';
import type { ZodType } from 'zod';
import { formatZodError } from '../utils/zodHelper.js';

type AnyZodSchema = ZodType<any, any, any>;
type SchemaMap = {
  body?: AnyZodSchema;
  query?: AnyZodSchema;
  params?: AnyZodSchema;
};

function safeAssignReqPart(req: any, part: 'body' | 'query' | 'params', parsed: any) {
  if (parsed === undefined) return;
  const existing = req[part];
  if (existing && typeof existing === 'object') {
    try {
      Object.assign(existing, parsed);
      return;
    } catch {
      // fallthrough to attempt assignment below
    }
  }

  try {
    req[part] = parsed;
  } catch {
    // swallow to avoid crashing. This scenario is rare; tests should catch it.
    // We intentionally do not rethrow, to avoid bringing down the app for odd req shapes.
  }
}

export const validate =
  (
    schemaOrMap: AnyZodSchema | SchemaMap,
    target: 'body' | 'query' | 'params' = 'body',
  ): RequestHandler =>
  (req, _res, next) => {
    const schemaMap: SchemaMap =
      typeof (schemaOrMap as AnyZodSchema).safeParse === 'function'
        ? { [target]: schemaOrMap as AnyZodSchema }
        : (schemaOrMap as SchemaMap);

    const collectedErrors: Record<string, unknown> = {};
    const parts: Array<'body' | 'query' | 'params'> = [
      'body',
      'query',
      'params',
    ];

    for (const part of parts) {
      const sch = schemaMap[part];
      if (!sch) continue;

      const source = (req as any)[part];
      const result = (sch as AnyZodSchema).safeParse(source);

      if (!result.success) {
        collectedErrors[part] = formatZodError(result.error);
      } else {
        safeAssignReqPart(req as any, part, result.data);
      }
    }

    if (Object.keys(collectedErrors).length > 0) {
      const err = createError(400, 'Validation failed');
      // attach structured errors for global error handler
      // @ts-ignore
      err.errors = collectedErrors;
      return next(err);
    }

    return next();
  };

export default validate;