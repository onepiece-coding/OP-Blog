import { getE2EAgent } from '../../tests/helpers/e2eClient.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import { registerAndLogin } from '../../tests/helpers/auth.js';
import Category from '../../src/models/Category.js';

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('E2E concurrency — category creation (HTTP smoke)', () => {
  test('many concurrent POST /api/v1/categories with same title -> exactly one created', async () => {
    const adminAgent = getE2EAgent();

    // Register first user (becomes admin) and log in via helper
    const { token } = await registerAndLogin(adminAgent, {
      username: `admin-conc-${Date.now()}`,
      email: `admin-conc-${Date.now()}@test.local`,
      password: 'Aa1!password',
    });
    (adminAgent as any).set('Authorization', `Bearer ${token}`);

    const title = `race-e2e-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;

    const N = 8; // concurrency level; increase = more aggressive stress

    // Launch N concurrent requests
    const requests: Array<Promise<any>> = [];
    for (let i = 0; i < N; i++) {
      requests.push(
        adminAgent
          .post('/api/v1/categories')
          .send({ title })
          .then((res: any) => ({ status: res.status, body: res.body }))
          .catch((err: any) => {
            // Supertest will surface HTTP responses as resolved promises;
            // this catch is defensive for other errors (network, etc).
            if (err && err.status) return { status: err.status, body: err.body };
            throw err;
          }),
      );
    }

    const results = await Promise.all(requests);

    // Count successes & failures
    const statuses = results.map((r) => r.status);
    const createdCount = statuses.filter((s) => s === 201).length;
    const otherStatuses = statuses.filter((s) => s !== 201);

    // Exactly one success expected; others should be 409 or 500 (or at least non-201)
    expect(createdCount).toBe(1);
    expect(otherStatuses.length).toBe(N - 1);
    for (const s of otherStatuses) {
      expect([409, 500]).toContain(s);
    }

    // DB must contain exactly one category with that title (case-insensitive)
    const dbCount = await Category.countDocuments({ title: new RegExp(`^${title}$`, 'i') });
    expect(dbCount).toBe(1);
  });
});