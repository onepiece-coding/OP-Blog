import request from 'supertest';
import app from '../../src/app.js';
import { createJwtForUser } from '../../tests/helpers/auth.js';
import { userFactory } from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import { env } from '../../src/env.js';

const client = request(app);

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('Secure cookie flags on logout', () => {
  const restoreEnv = (origProc: string | undefined, origParsed: string | undefined) => {
    if (typeof origProc === 'undefined') delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origProc;
    if (typeof origParsed === 'undefined') delete (env as any).NODE_ENV;
    else (env as any).NODE_ENV = origParsed;
  };

  test('In production: authToken cookie includes Secure; userInfo cookie includes Secure and authToken is HttpOnly', async () => {
    const origProc = process.env.NODE_ENV;
    const origParsed = (env as any).NODE_ENV;

    try {
      process.env.NODE_ENV = 'production';
      (env as any).NODE_ENV = 'production';

      const u = await userFactory();
      const token = createJwtForUser(u as any);
      const authHeader = { Authorization: `Bearer ${token}` };

      const res = await client.post(`/api/v1/auth/logout/${(u as any)._id}`).set(authHeader).expect(200);

      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const joined = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);

      expect(joined.toLowerCase()).toContain('authtoken=');
      expect(joined.toLowerCase()).toContain('secure');
      expect(joined.toLowerCase()).toContain('httponly');

      expect(joined.toLowerCase()).toContain('userinfo=');
      expect(joined.toLowerCase()).toContain('secure');
    } finally {
      restoreEnv(origProc, origParsed);
    }
  });

  test('In non-production (test/dev): authToken cookie does NOT include Secure; authToken is HttpOnly', async () => {
    const origProc = process.env.NODE_ENV;
    const origParsed = (env as any).NODE_ENV;

    try {
      process.env.NODE_ENV = 'test';
      (env as any).NODE_ENV = 'test';

      const u = await userFactory();
      const token = createJwtForUser(u as any);
      const authHeader = { Authorization: `Bearer ${token}` };

      const res = await client.post(`/api/v1/auth/logout/${(u as any)._id}`).set(authHeader).expect(200);

      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const joined = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
      const lower = joined.toLowerCase();

      expect(lower).toContain('authtoken=');
      expect(lower).toContain('httponly');
      expect(lower).not.toContain('secure');
    } finally {
      restoreEnv(origProc, origParsed);
    }
  });
});