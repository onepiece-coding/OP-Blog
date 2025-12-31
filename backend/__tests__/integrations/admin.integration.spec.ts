import request from 'supertest';
import app from '../../src/app.js';
import { createJwtForUser } from '../../tests/helpers/auth.js';
import {
  userFactory,
  postFactory,
  categoryFactory,
  commentFactory,
} from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';

const client = request(app);

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('Admin integration — /api/v1/admin/info', () => {
  test('admin can fetch counts and they match DB records', async () => {
    const admin = await userFactory({ isAdmin: true });
    const u1 = await userFactory();
    const u2 = await userFactory();

    const c1 = await categoryFactory({ user: (admin as any)._id });
    const c2 = await categoryFactory({ user: (u1 as any)._id });
    const c3 = await categoryFactory({ user: (u2 as any)._id });

    const p1 = await postFactory({ user: (u1 as any)._id, categoryId: (c1 as any)._id });
    const p2 = await postFactory({ user: (u2 as any)._id, categoryId: (c2 as any)._id });
    await postFactory({ user: (u1 as any)._id, categoryId: (c3 as any)._id });

    await commentFactory({ postId: (p1 as any)._id, user: (u2 as any)._id });
    await commentFactory({ postId: (p1 as any)._id, user: (admin as any)._id });
    await commentFactory({ postId: (p2 as any)._id, user: (u1 as any)._id });

    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const res = await client.get('/api/v1/admin/info').set(adminHeader).expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.users).toBe(3);
    expect(res.body.posts).toBe(3);
    expect(res.body.categories).toBe(3);
    expect(res.body.comments).toBe(3);
  });

  test('non-admin cannot access admin info (403)', async () => {
    const normal = await userFactory();
    const normalHeader = { Authorization: `Bearer ${createJwtForUser(normal as any)}` };

    await client.get('/api/v1/admin/info').set(normalHeader).expect(403);
  });

  test('unauthenticated request returns 401', async () => {
    await client.get('/api/v1/admin/info').expect(401);
  });

  test('counts reflect only admin when DB has only one user (zero for others)', async () => {
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const res = await client.get('/api/v1/admin/info').set(adminHeader).expect(200);

    expect(res.body.users).toBe(1);
    expect(res.body.posts).toBe(0);
    expect(res.body.categories).toBe(0);
    expect(res.body.comments).toBe(0);
  });
});