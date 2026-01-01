import { jest } from "@jest/globals";
import httpMocks from 'node-mocks-http';
import { z } from 'zod';

describe('validate middleware', () => {
  afterEach(() => {
    if (typeof jest !== 'undefined' && typeof jest.resetModules === 'function') jest.resetModules();
    jest.restoreAllMocks();
  });

  it('passes valid body through and writes parsed data back', async () => {
    const schema = z.object({ name: z.string().min(1) });
    const { validate } = await import('../../src/middlewares/validate.js');

    const req = httpMocks.createRequest({ body: { name: 'ok' } });
    const res = httpMocks.createResponse();
    const next = jest.fn();

    const mw = validate(schema);
    await (mw as any)(req as any, res as any, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as any).body).toEqual({ name: 'ok' });
  });

  it('returns 400 and attaches zod errors for invalid body', async () => {
    const schema = z.object({ name: z.string().min(3) });
    const { validate } = await import('../../src/middlewares/validate.js');

    const req = httpMocks.createRequest({ body: { name: 'x' } });
    const res = httpMocks.createResponse();
    const next = jest.fn();

    const mw = validate(schema);
    await (mw as any)(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
    const err = (next as jest.Mock).mock.calls[0][0] as { status: number };
    expect(err).toBeTruthy();
    expect(err.status).toBe(400);
    expect((err as any).errors).toBeTruthy();
  });

  it('does not throw when req parts are getter-only (non-writable), still calls next', async () => {
    const { validate } = await import('../../src/middlewares/validate.js');
    const schema = z.object({ page: z.coerce.number().int().min(1) });

    const req: any = {};
    Object.defineProperty(req, 'query', {
      get() {
        return { page: '2' };
      },
      enumerable: true,
    });

    const res = httpMocks.createResponse();
    const next = jest.fn();

    const mw = validate(schema, 'query');

    const call = () => (mw as any)(req, res, next);
    expect(call).not.toThrow();

    expect(next).toHaveBeenCalled();
  });
});