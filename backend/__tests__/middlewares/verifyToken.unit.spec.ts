import { jest } from '@jest/globals';
import httpMocks from 'node-mocks-http';
import jwt from 'jsonwebtoken';

describe('verifyToken middleware', () => {
  const SECRET = 'x'.repeat(64);

  const tick = () => new Promise((res) => setImmediate(res));

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.NODE_ENV;
    jest.restoreAllMocks();
  });

  it('calls next with 401 when no Authorization header', async () => {
    const { verifyToken } = await import('../../src/middlewares/verifyToken.js');

    const req = httpMocks.createRequest();
    const res = httpMocks.createResponse();
    const next = jest.fn();

    await verifyToken(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as any;
    expect(err).toBeTruthy();
    expect(err.message).toBe('No token provided');
    expect(err.status || err.statusCode).toBe(401);
  });

  it('calls next with 401 when Authorization scheme is not Bearer', async () => {
    const { verifyToken } = await import('../../src/middlewares/verifyToken.js');

    const req = httpMocks.createRequest({
      headers: { authorization: 'Token abc.def.ghi' },
    });
    const res = httpMocks.createResponse();
    const next = jest.fn();

    await verifyToken(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as any;
    expect(err.message).toBe('No token provided');
    expect(err.status || err.statusCode).toBe(401);
  });

  it('calls next with 401 when token is invalid', async () => {
    const { verifyToken } = await import('../../src/middlewares/verifyToken.js');

    const req = httpMocks.createRequest({
      headers: { authorization: 'Bearer invalid.token.here' },
    });
    const res = httpMocks.createResponse();
    const next = jest.fn();

    await verifyToken(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as any;
    expect(err.message).toBe('Invalid token');
    expect(err.status || err.statusCode).toBe(401);
  });

  it('calls next with 404 when token valid but user not found', async () => {
    const UserModule: any = await import('../../src/models/User.js');
    const User = UserModule.default ?? UserModule;
    const { verifyToken } = await import('../../src/middlewares/verifyToken.js');

    const token = jwt.sign({ id: 'missing-id', isAdmin: false }, SECRET);

    const findSpy = jest.spyOn(User, 'findById' as any).mockImplementation(() => ({
      select: (_sel: string) => Promise.resolve(null),
    }));

    const req = httpMocks.createRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = httpMocks.createResponse();
    const next = jest.fn();

    await verifyToken(req as any, res as any, next);

    expect(findSpy).toHaveBeenCalledWith('missing-id');
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as any;
    expect(err.message).toBe('User not found');
    expect(err.status || err.statusCode).toBe(404);

    findSpy.mockRestore();
  });

  it('sets req.user and calls next() for valid token and existing user', async () => {
    const UserModule: any = await import('../../src/models/User.js');
    const User = UserModule.default ?? UserModule;
    const { verifyToken } = await import('../../src/middlewares/verifyToken.js');

    const fakeUser = { _id: 'u1', id: 'u1', username: 'bob', isAdmin: false };

    const findSpy = jest.spyOn(User, 'findById' as any).mockImplementation(() => ({
      select: (_sel: string) => Promise.resolve(fakeUser),
    }));

    const token = jwt.sign({ id: 'u1', isAdmin: false }, SECRET);
    const req = httpMocks.createRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = httpMocks.createResponse();
    const next = jest.fn();

    await verifyToken(req as any, res as any, next);

    expect(findSpy).toHaveBeenCalledWith('u1');
    expect(req.user).toBe(fakeUser);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0].length).toBe(0);

    findSpy.mockRestore();
  });

  it('verifyTokenAndAdmin allows admin and rejects non-admin', async () => {
    const UserModule: any = await import('../../src/models/User.js');
    const User = UserModule.default ?? UserModule;
    const mod = await import('../../src/middlewares/verifyToken.js');
    const { verifyTokenAndAdmin } = mod;

    jest.spyOn(User, 'findById' as any).mockImplementation(() => ({
      select: (_: string) => Promise.resolve({ id: 'a', isAdmin: true }),
    }));

    const adminToken = jwt.sign({ id: 'a', isAdmin: true }, SECRET);
    const req1 = httpMocks.createRequest({ headers: { authorization: `Bearer ${adminToken}` } });
    const next1 = jest.fn();

    verifyTokenAndAdmin(req1 as any, {} as any, next1);
    await tick();
    expect(next1).toHaveBeenCalledTimes(1);
    expect(next1.mock.calls[0].length).toBe(0);

    jest.spyOn(User, 'findById' as any).mockImplementation(() => ({
      select: (_: string) => Promise.resolve({ id: 'u', isAdmin: false }),
    }));

    const userToken = jwt.sign({ id: 'u', isAdmin: false }, SECRET);
    const req2 = httpMocks.createRequest({ headers: { authorization: `Bearer ${userToken}` } });
    const next2 = jest.fn();

    verifyTokenAndAdmin(req2 as any, {} as any, next2);
    await tick();
    expect(next2).toHaveBeenCalledTimes(1);
    const err = next2.mock.calls[0][0] as any;
    expect(err.message).toMatch(/Not allowed, only admin/);
    expect(err.status || err.statusCode).toBe(403);
  });

  it('verifyTokenAndOnlyUser allows same user and rejects others', async () => {
    const UserModule: any = await import('../../src/models/User.js');
    const User = UserModule.default ?? UserModule;
    const mod = await import('../../src/middlewares/verifyToken.js');
    const { verifyTokenAndOnlyUser } = mod;

    jest.spyOn(User, 'findById' as any).mockImplementation(() => ({
      select: (_: string) => Promise.resolve({ id: 'same', isAdmin: false }),
    }));

    const tokenGood = jwt.sign({ id: 'same', isAdmin: false }, SECRET);
    const req1 = httpMocks.createRequest({ headers: { authorization: `Bearer ${tokenGood}` }, params: { id: 'same' } });
    const next1 = jest.fn();

    verifyTokenAndOnlyUser(req1 as any, {} as any, next1);
    await tick();
    expect(next1).toHaveBeenCalledTimes(1);
    expect(next1.mock.calls[0].length).toBe(0);

    jest.spyOn(User, 'findById' as any).mockImplementation(() => ({
      select: (_: string) => Promise.resolve({ id: 'other', isAdmin: false }),
    }));

    const tokenBad = jwt.sign({ id: 'other', isAdmin: false }, SECRET);
    const req2 = httpMocks.createRequest({ headers: { authorization: `Bearer ${tokenBad}` }, params: { id: 'same' } });
    const next2 = jest.fn();

    verifyTokenAndOnlyUser(req2 as any, {} as any, next2);
    await tick();
    expect(next2).toHaveBeenCalledTimes(1);
    const err = next2.mock.calls[0][0] as any;
    expect(err.message).toMatch(/Not allowed, only user himself/);
    expect(err.status || err.statusCode).toBe(403);
  });

  it('verifyTokenAndAuthorization allows when id matches or isAdmin true otherwise rejects', async () => {
    const UserModule: any = await import('../../src/models/User.js');
    const User = UserModule.default ?? UserModule;
    const mod = await import('../../src/middlewares/verifyToken.js');
    const { verifyTokenAndAuthorization } = mod;

    jest.spyOn(User, 'findById' as any).mockImplementation(() => ({
      select: (_: string) => Promise.resolve({ id: 'm', isAdmin: false }),
    }));
    const t1 = jwt.sign({ id: 'm', isAdmin: false }, SECRET);
    const req1 = httpMocks.createRequest({ headers: { authorization: `Bearer ${t1}` }, params: { id: 'm' } });
    const next1 = jest.fn();
    verifyTokenAndAuthorization(req1 as any, {} as any, next1);
    await tick();
    expect(next1).toHaveBeenCalledTimes(1);
    expect(next1.mock.calls[0].length).toBe(0);

    jest.spyOn(User, 'findById' as any).mockImplementation(() => ({
      select: (_: string) => Promise.resolve({ id: 'admin', isAdmin: true }),
    }));
    const t2 = jwt.sign({ id: 'admin', isAdmin: true }, SECRET);
    const req2 = httpMocks.createRequest({ headers: { authorization: `Bearer ${t2}` }, params: { id: 'someone' } });
    const next2 = jest.fn();
    verifyTokenAndAuthorization(req2 as any, {} as any, next2);
    await tick();
    expect(next2).toHaveBeenCalledTimes(1);
    expect(next2.mock.calls[0].length).toBe(0);

    jest.spyOn(User, 'findById' as any).mockImplementation(() => ({
      select: (_: string) => Promise.resolve({ id: 'u9', isAdmin: false }),
    }));
    const t3 = jwt.sign({ id: 'u9', isAdmin: false }, SECRET);
    const req3 = httpMocks.createRequest({ headers: { authorization: `Bearer ${t3}` }, params: { id: 'someone-else' } });
    const next3 = jest.fn();
    verifyTokenAndAuthorization(req3 as any, {} as any, next3);
    await tick();
    expect(next3).toHaveBeenCalledTimes(1);
    const err = next3.mock.calls[0][0] as any;
    expect(err.message).toMatch(/Not allowed, only user himself/);
    expect(err.status || err.statusCode).toBe(403);
  });

  it('verifyTokenAndAdmin returns 401 when verifyToken finished but req.user not set (simulated)', async () => {
    const mod = await import('../../src/middlewares/verifyToken.js');
    const { verifyTokenAndAdmin } = mod;

    const req = httpMocks.createRequest({
      headers: { authorization: 'Bearer SIMULATE_NO_USER' },
    });
    const next = jest.fn();

    verifyTokenAndAdmin(req as any, {} as any, next);
    await tick();

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as any;
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/No token provided/i);
    expect(err.status || err.statusCode).toBe(401);
  });

  it('verifyTokenAndOnlyUser returns 401 when verifyToken finished but req.user not set (simulated)', async () => {
    const mod = await import('../../src/middlewares/verifyToken.js');
    const { verifyTokenAndOnlyUser } = mod;

    const req = httpMocks.createRequest({
      headers: { authorization: 'Bearer SIMULATE_NO_USER' },
      params: { id: 'any-id' },
    });
    const next = jest.fn();

    verifyTokenAndOnlyUser(req as any, {} as any, next);
    await tick();

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as any;
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/No token provided/i);
    expect(err.status || err.statusCode).toBe(401);
  });

  it('verifyTokenAndAuthorization returns 401 when verifyToken finished but req.user not set (simulated)', async () => {
    const mod = await import('../../src/middlewares/verifyToken.js');
    const { verifyTokenAndAuthorization } = mod;

    const req = httpMocks.createRequest({
      headers: { authorization: 'Bearer SIMULATE_NO_USER' },
      params: { id: 'someone' },
    });
    const next = jest.fn();

    verifyTokenAndAuthorization(req as any, {} as any, next);
    await tick();

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as any;
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/No token provided/i);
    expect(err.status || err.statusCode).toBe(401);
  });
});