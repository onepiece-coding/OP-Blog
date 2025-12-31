import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

describe('Rate limiter — deterministic test (local test app)', () => {
  let app: express.Express;
  let client: request.SuperTest<request.Test>;

  beforeAll(() => {
    const createLimiter = (opts: { max?: number; windowMs?: number } = {}) => {
      const max = typeof opts.max === 'number' ? opts.max : 3;
      const windowMs = typeof opts.windowMs === 'number' ? opts.windowMs : 200;
      let count = 0;
      let windowStart = Date.now();

      return (_req: Request, res: Response, next: NextFunction) => {
        const now = Date.now();
        if (now - windowStart >= windowMs) {
          windowStart = now;
          count = 0;
        }
        count += 1;
        if (count > max) {
          return res.status(429).json({ message: 'Too many requests' });
        }
        return next();
      };
    };

    app = express();
    const limiter = createLimiter({ max: 3, windowMs: 200 });
    app.get('/__test_ping', limiter, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    client = request(app) as unknown as request.SuperTest<request.Test>;
  });

  test('first N requests succeed then next request gets 429', async () => {
    const OK_COUNT = 3;

    for (let i = 0; i < OK_COUNT; i++) {
      const res = await client.get('/__test_ping');
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      expect(res.body.ok).toBe(true);
    }

    const over = await client.get('/__test_ping');
    expect(over.status).toBe(429);
    expect(over.body).toHaveProperty('message');
  });

  test('window resets after windowMs and requests succeed again', async () => {
    await new Promise((r) => setTimeout(r, 250));
    const res = await client.get('/__test_ping');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});