import request from 'supertest';
import app from '../../src/app.js';
import { createJwtForUser } from '../../tests/helpers/auth.js';
import { userFactory } from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import Category from '../../src/models/Category.js';

const client = request(app);

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
  try {
    await Category.createIndexes();
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.warn('createIndexes failed (non-fatal):', err?.message ?? err);
  }
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('Concurrent duplicate category creation (race)', () => {
  test('two concurrent requests: one succeeds (201) and the other fails (409/500); DB has single record', async () => {
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const title = `race-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const p1 = client.post('/api/v1/categories').set(adminHeader).send({ title });
    const p2 = client.post('/api/v1/categories').set(adminHeader).send({ title });

    const [res1, res2] = await Promise.all([p1, p2]);

    const statuses = [res1.status, res2.status];
    const successCount = statuses.filter((s) => s === 201).length;
    expect(successCount).toBe(1);

    const failures = statuses.filter((s) => s !== 201);
    expect(failures.length).toBe(1);
    for (const f of failures) {
      expect([409, 500].includes(f)).toBeTruthy();
    }

    const dbCount = await Category.countDocuments({ title: new RegExp(`^${title}$`, 'i') });
    expect(dbCount).toBe(1);
  });

  test('many concurrent requests: only one creates the category; others fail; DB has single record', async () => {
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const title = `race-many-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const CONC = 8;
    const promises = [];
    for (let i = 0; i < CONC; i++) {
      promises.push(client.post('/api/v1/categories').set(adminHeader).send({ title }));
    }

    const responses = await Promise.all(promises);
    const statuses = responses.map((r) => r.status);
    const successCount = statuses.filter((s) => s === 201).length;
    expect(successCount).toBe(1);

    const otherStatuses = statuses.filter((s) => s !== 201);
    expect(otherStatuses.length).toBe(CONC - 1);
    for (const s of otherStatuses) {
      expect([409, 500].includes(s)).toBeTruthy();
    }

    const dbCount = await Category.countDocuments({ title: new RegExp(`^${title}$`, 'i') });
    expect(dbCount).toBe(1);
  });
});