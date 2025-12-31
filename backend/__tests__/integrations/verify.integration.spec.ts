import request from 'supertest';
import app from '../../src/app.js';
import { userFactory, createVerificationToken } from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import mongoose from 'mongoose';
import VerificationToken from '../../src/models/VerificationToken.js';
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

describe('Account verification endpoint — negative cases', () => {
  test('malformed userId (route param) returns 400', async () => {
    await client.get('/api/v1/auth/not-a-valid-id/verify/sometoken').expect(400);
  });

  test('non-existing user returns 400 "Invalid link"', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await client.get(`/api/v1/auth/${fakeId}/verify/some-token`).expect(400);
    expect(res.body).toBeDefined();
    expect(res.body.message).toMatch(/invalid link/i);
  });

  test('existing user but no token in DB -> 400 "Invalid link"', async () => {
    const user = await userFactory({ isAccountVerified: false });
    const res = await client
      .get(`/api/v1/auth/${(user as any)._id}/verify/some-nonexistent-token`)
      .expect(400);
    expect(res.body.message).toMatch(/invalid link/i);
  });

  test('wrong token for user returns 400 "Invalid link"', async () => {
    const user = await userFactory({ isAccountVerified: false });
    await createVerificationToken((user as any)._id.toString(), 'real-token-123');

    const res = await client
      .get(`/api/v1/auth/${(user as any)._id}/verify/wrong-token-xyz`)
      .expect(400);

    expect(res.body.message).toMatch(/invalid link/i);

    const t = await VerificationToken.findOne({ userId: (user as any)._id });
    expect(t).toBeTruthy();
    expect(t!.token).toBe('real-token-123');
  });

  test('token belonging to different user returns 400 "Invalid link"', async () => {
    const userA = await userFactory({ isAccountVerified: false });
    const userB = await userFactory({ isAccountVerified: false });

    const tokenRec = await createVerificationToken((userA as any)._id.toString(), 'uA-token-xyz');

    const res = await client
      .get(`/api/v1/auth/${(userB as any)._id}/verify/${tokenRec.token}`)
      .expect(400);

    expect(res.body.message).toMatch(/invalid link/i);
  });

  test('successful verify removes token; second attempt returns 400', async () => {
    const user = await userFactory({ isAccountVerified: false });
    const tokenRec = await createVerificationToken((user as any)._id.toString(), 'verify-me-1');

    const ok = await client
      .get(`/api/v1/auth/${(user as any)._id}/verify/${tokenRec.token}`)
      .expect(200);

    expect(ok.body).toHaveProperty('success', true);
    expect(ok.body.message).toMatch(/verified/i);

    const freshUser = await User.findById((user as any)._id);
    expect(freshUser).toBeTruthy();
    expect(freshUser!.isAccountVerified).toBe(true);

    const tokenAfter = await VerificationToken.findOne({ userId: (user as any)._id });
    expect(tokenAfter).toBeNull();

    await client
      .get(`/api/v1/auth/${(user as any)._id}/verify/${tokenRec.token}`)
      .expect(400);
  });
});