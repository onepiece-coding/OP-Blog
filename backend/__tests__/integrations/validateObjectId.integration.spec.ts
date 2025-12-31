import request from 'supertest';
import app from '../../src/app.js';
import {
  userFactory,
  postFactory,
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

describe('validateObjectIdParam integration', () => {
  const malformed = 'not-a-valid-id';

  test('auth logout route: malformed id -> 400 (validateObjectIdParam runs before auth)', async () => {
    await client.post(`/api/v1/auth/logout/${malformed}`).expect(400);
  });

  test('posts route (get single): malformed id -> 400', async () => {
    await client.get(`/api/v1/posts/${malformed}`).expect(400);
  });

  test('posts route (update-image): malformed id -> 400', async () => {
    await client.patch(`/api/v1/posts/update-image/${malformed}`).expect(400);
  });

  test('users profile route: malformed id -> 400', async () => {
    await client.get(`/api/v1/users/profile/${malformed}`).expect(400);
  });

  test('password reset route: malformed userId -> 400 for GET and POST', async () => {
    await client.get(`/api/v1/password/reset-password/${malformed}/some-token`).expect(400);
    await client.post(`/api/v1/password/reset-password/${malformed}/some-token`).send({ password: 'S0m3P@ss!' }).expect(400);
  });

  test('well-formed ObjectId passes validate and next middleware runs (posts/:id) — existing resource returns 200', async () => {
    const post = await postFactory();
    const res = await client.get(`/api/v1/posts/${(post as any)._id}`).expect(200);
    expect(res.body).toBeDefined();
    expect(res.body._id || res.body.id || res.body).toBeDefined();
  });

  test('well-formed ObjectId passes validate and next middleware runs (auth logout) — without token next middleware returns 401', async () => {
    const user = await userFactory();
    await client.post(`/api/v1/auth/logout/${(user as any)._id}`).expect(401);
  });

  test('well-formed ObjectId passes validate and next middleware runs (password reset) — with non-existing token returns 400 from controller', async () => {
    const user = await userFactory({ isAccountVerified: false });
    await client.get(`/api/v1/password/reset-password/${(user as any)._id}/no-such-token`).expect(400);
  });

  test('validateObjectIdParam used with different param name (userId) rejects malformed', async () => {
    await client.get(`/api/v1/auth/${malformed}/verify/some-token`).expect(400);
  });
});