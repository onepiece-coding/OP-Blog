import { Request, Response, NextFunction } from 'express';

export const notFound = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  // @ts-ignore: attach statusCode for errorHandler
  error.statusCode = 404;
  next(error);
};

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  // Convert Mongoose validation errors to 400 with structured messages
  if (err && err.name === 'ValidationError' && err.errors) {
    const errors: Record<string, any> = {};
    for (const [key, val] of Object.entries(err.errors)) {
      // val may contain message
      errors[key] = { message: (val as any).message };
    }
    const response: Record<string, any> = {
      message: 'Validation failed',
      errors,
    };
    if (process.env.NODE_ENV !== 'production') {
      response.stack = err.stack;
    }
    return res.status(400).json(response);
  }

  const status = err.statusCode ?? 500;
  const response: Record<string, any> = { message: err.message ?? 'Internal Server Error' };
  if (err.errors) response.errors = err.errors; // include zod details or attached structured errors
  if (process.env.NODE_ENV !== 'production') response.stack = err.stack;
  res.status(status).json(response);
};