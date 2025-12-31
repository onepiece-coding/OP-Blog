import request from 'supertest';
import { jest } from '@jest/globals';

describe('CORS & security headers', () => {
  const loadAppWithEnv = async (env: Record<string, string | undefined>) => {
    jest.resetModules();
    for (const k of Object.keys(env)) {
      if (typeof env[k] === 'undefined') {
        delete process.env[k];
      } else {
        process.env[k] = env[k] as string;
      }
    }
    process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
    const mod = await import('../../src/app.js');
    return mod.default;
  };

  const expectNotServerError = (status: number) => {
    if (status >= 500) throw new Error(`Unexpected server error status ${status}`);
  };

  test('OPTIONS preflight and GET include allowed origin when CLIENT_DOMAIN set', async () => {
    const origin = 'https://example.com';
    const app = await loadAppWithEnv({ CLIENT_DOMAIN: origin });
    const client = request(app);

    const pre = await client
      .options('/api/v1')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET');

    expectNotServerError(pre.status);

    expect(pre.headers['access-control-allow-origin']).toBe(origin);

    expect(pre.headers['access-control-allow-credentials']).toBeDefined();

    const allowMethods = (pre.headers['access-control-allow-methods'] || '').toUpperCase();
    expect(allowMethods).toContain('GET');

    const get = await client.get('/api/v1').set('Origin', origin);
    expectNotServerError(get.status);
    expect(get.headers['access-control-allow-origin']).toBe(origin);

    expect(get.headers['x-content-type-options']).toBe('nosniff');
  });

  test('Origin not equal to CLIENT_DOMAIN does not get that origin echoed', async () => {
    const allowed = 'https://good.example';
    const badOrigin = 'https://evil.example';
    const app = await loadAppWithEnv({ CLIENT_DOMAIN: allowed });
    const client = request(app);

    const res = await client.get('/api/v1').set('Origin', badOrigin);
    expectNotServerError(res.status);

    const acao = res.headers['access-control-allow-origin'];
    expect(acao === undefined || acao !== badOrigin).toBe(true);
  });

  test('When CLIENT_DOMAIN is not set (default "*") preflight either returns "*" or echoes the origin', async () => {
    const origin = 'https://some-origin.test';
    const app = await loadAppWithEnv({ CLIENT_DOMAIN: undefined });
    const client = request(app);

    const pre = await client
      .options('/api/v1')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET');

    expectNotServerError(pre.status);

    const acaoRaw = pre.headers['access-control-allow-origin'];
    const acao = typeof acaoRaw === 'string' ? acaoRaw : String(acaoRaw ?? '');

    const isWildcard = acao === '*';
    const isEchoed = acao === origin;
    const looksLikeUrl = /^https?:\/\/.+/.test(acao);

    if (!(isWildcard || isEchoed || looksLikeUrl)) {
      throw new Error(
        `Unexpected Access-Control-Allow-Origin value: ${JSON.stringify(acaoRaw)} — expected "*" or echoed origin or a configured origin URL`,
      );
    }

    expect(acao).toBeTruthy();

    const get = await client.get('/api/v1').set('Origin', origin);
    expectNotServerError(get.status);
    expect(get.headers['x-content-type-options']).toBe('nosniff');
  });
});