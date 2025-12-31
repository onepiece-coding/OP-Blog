import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { registerAndLogin, createJwtForUser } from '../../tests/helpers/auth.js';
import { userFactory } from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import User from '../../src/models/User.js';

const client = request(app);

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('verifyToken middleware — integration', () => {
  test('missing Authorization header -> 401 on a protected route (GET /users/me)', async () => {
    await client.get('/api/v1/users/me').expect(401);
  });

  test('wrong auth scheme -> 401 (Authorization: Token ...)', async () => {
    await client.get('/api/v1/users/me').set('Authorization', 'Token abc.def.ghi').expect(401);
  });

  test('invalid token format/signature -> 401', async () => {
    await client.get('/api/v1/users/me').set('Authorization', 'Bearer invalid.token.here').expect(401);
  });

  test('valid token but user not found -> 404', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const token = createJwtForUser({ _id: fakeId, isAdmin: false });
    await client.get('/api/v1/users/me').set('Authorization', `Bearer ${token}`).expect(404);
  });

  test('valid token and existing user -> 200 (GET /users/me)', async () => {
    const { authHeader } = await registerAndLogin(undefined, { username: `vt-${Date.now()}` });
    const res = await client.get('/api/v1/users/me').set(authHeader).expect(200);
    expect(res.body.status).toBe(true);
    expect(res.body.result).toBeDefined();
    expect(res.body.result.username).toBeDefined();
  });
});

describe('verifyTokenAndAdmin (admin-only) — integration', () => {
  test('admin can access /api/v1/admin/info (200)', async () => {
    const admin = await userFactory({ isAdmin: true });
    const header = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };
    const res = await client.get('/api/v1/admin/info').set(header).expect(200);
    expect(res.body).toBeDefined();
    expect(typeof res.body.users).toBe('number');
  });

  test('non-admin receives 403', async () => {
    const normal = await userFactory();
    const header = { Authorization: `Bearer ${createJwtForUser(normal as any)}` };
    await client.get('/api/v1/admin/info').set(header).expect(403);
  });

  test('unauthenticated request -> 401', async () => {
    await client.get('/api/v1/admin/info').expect(401);
  });
});

describe('verifyTokenAndOnlyUser & verifyTokenAndAuthorization — integration', () => {
  test('verifyTokenAndOnlyUser allows owner to PATCH profile and rejects other user', async () => {
    const { user, authHeader } = await registerAndLogin(undefined, { username: `owner-${Date.now()}` });
    const newName = 'NewOwnerName';
    const ok = await client
      .patch(`/api/v1/users/profile/${user._id}`)
      .set(authHeader)
      .send({ username: newName })
      .expect(200);
    expect(ok.body.username).toBe(newName);

    const other = await userFactory();
    const otherHeader = { Authorization: `Bearer ${createJwtForUser(other as any)}` };
    await client
      .patch(`/api/v1/users/profile/${user._id}`)
      .set(otherHeader)
      .send({ username: 'Hacker' })
      .expect(403);
  });

  test('verifyTokenAndAuthorization allows owner or admin to DELETE, rejects other users', async () => {
    const owner = await userFactory();
    const ownerHeader = { Authorization: `Bearer ${createJwtForUser(owner as any)}` };

    await client.delete(`/api/v1/users/profile/${(owner as any)._id}`).set(ownerHeader).expect(200);
    const found = await User.findById((owner as any)._id);
    expect(found).toBeNull();

    const victim = await userFactory();
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    await client.delete(`/api/v1/users/profile/${(victim as any)._id}`).set(adminHeader).expect(200);

    const a = await userFactory();
    const b = await userFactory();
    const aHeader = { Authorization: `Bearer ${createJwtForUser(a as any)}` };
    await client.delete(`/api/v1/users/profile/${(b as any)._id}`).set(aHeader).expect(403);
  });
});