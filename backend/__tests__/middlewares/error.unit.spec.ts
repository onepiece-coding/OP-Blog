import { jest } from '@jest/globals';
import { notFound, errorHandler } from '../../src/middlewares/error.js';
import type { Request, Response, NextFunction } from 'express';

describe('error middlewares', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    jest.resetAllMocks();
  });

  describe('notFound', () => {
    test('creates an error with 404 statusCode and calls next(error)', () => {
      const req = { originalUrl: '/some/missing' } as unknown as Request;
      const next = jest.fn() as jest.Mock;

      notFound(req, {} as unknown as Response, next as unknown as NextFunction);

      expect(next).toHaveBeenCalledTimes(1);
      const err = (next.mock.calls[0][0] as any) as Error & { statusCode?: number };
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Not Found - /some/missing');
      expect(err.statusCode).toBe(404);
    });
  });

  describe('errorHandler', () => {
    test('responds with 500 and includes stack when NODE_ENV is not production', () => {
      process.env.NODE_ENV = 'test';

      const err = new Error('something exploded');
      err.stack = 'fake-stack';

      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockImplementation(() => ({ json: jsonMock }));
      const res = { status: statusMock } as unknown as Response;

      errorHandler(err as any, {} as Request, res, (() => {}) as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledTimes(1);

      const sent = jsonMock.mock.calls[0][0] as Record<string, unknown>;
      expect(sent).toHaveProperty('message', 'something exploded');
      expect(sent).toHaveProperty('stack', 'fake-stack');
      expect(sent).not.toHaveProperty('errors');
    });

    test('responds with provided statusCode and includes err.errors; hides stack in production', () => {
      process.env.NODE_ENV = 'production';

      const err: any = new Error('bad request');
      err.statusCode = 400;
      err.errors = { body: [{ path: 'username', message: 'required' }] };
      err.stack = 'should-not-be-shown';

      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockImplementation(() => ({ json: jsonMock }));
      const res = { status: statusMock } as unknown as Response;

      errorHandler(err, {} as Request, res, (() => {}) as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledTimes(1);

      const sent = jsonMock.mock.calls[0][0] as Record<string, unknown>;
      expect(sent).toHaveProperty('message', 'bad request');
      expect(sent).toHaveProperty('errors');
      expect(sent.errors).toEqual(err.errors);
      expect(sent).not.toHaveProperty('stack');
    });

    test('handles non-Error-ish err objects gracefully', () => {
      process.env.NODE_ENV = 'test';
      const err = { message: 'oops', statusCode: 418, errors: { a: 1 } } as any;

      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockImplementation(() => ({ json: jsonMock }));
      const res = { status: statusMock } as unknown as Response;

      errorHandler(err, {} as Request, res, (() => {}) as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(418);
      expect(jsonMock).toHaveBeenCalledTimes(1);
      const sent = jsonMock.mock.calls[0][0] as Record<string, unknown>;
      expect(sent).toHaveProperty('message', 'oops');
      expect(sent).toHaveProperty('errors', err.errors);
      expect(sent).toHaveProperty('stack');
    });

    test('converts Mongoose ValidationError into 400 with structured errors and includes stack in non-production', () => {
      process.env.NODE_ENV = 'test';

      const err: any = {
        name: 'ValidationError',
        errors: {
          username: { message: 'Username is required' },
          email: { message: 'Email invalid' },
        },
        stack: 'validation-stack',
      };

      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockImplementation(() => ({ json: jsonMock }));
      const res = { status: statusMock } as unknown as Response;

      errorHandler(err, {} as Request, res, (() => {}) as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledTimes(1);

      const sent = jsonMock.mock.calls[0][0] as Record<string, unknown>;
      expect(sent).toHaveProperty('message', 'Validation failed');
      expect(sent).toHaveProperty('errors');
      expect((sent.errors as any).username).toEqual({ message: 'Username is required' });
      expect((sent.errors as any).email).toEqual({ message: 'Email invalid' });
      expect(sent).toHaveProperty('stack', 'validation-stack');
    });

    test('converts Mongoose ValidationError into 400 but hides stack in production', () => {
      process.env.NODE_ENV = 'production';

      const err: any = {
        name: 'ValidationError',
        errors: {
          username: { message: 'Username required' },
        },
        stack: 'should-not-show',
      };

      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockImplementation(() => ({ json: jsonMock }));
      const res = { status: statusMock } as unknown as Response;

      errorHandler(err, {} as Request, res, (() => {}) as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledTimes(1);

      const sent = jsonMock.mock.calls[0][0] as Record<string, unknown>;
      expect(sent).toHaveProperty('message', 'Validation failed');
      expect(sent).toHaveProperty('errors');
      expect((sent.errors as any).username).toEqual({ message: 'Username required' });
      expect(sent).not.toHaveProperty('stack');
    });
  });
});