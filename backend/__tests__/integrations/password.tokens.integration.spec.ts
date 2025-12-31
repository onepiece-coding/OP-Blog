import request from 'supertest';
import app from '../../src/app.js';
import {
  userFactory,
  createVerificationToken,
} from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import VerificationToken from '../../src/models/VerificationToken.js';

const client = request(app);

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('Password reset token lifecycle & reuse', () => {
  test('used token is deleted after successful reset and cannot be reused', async () => {
    const origPassword = 'OrigP@ss1';
    const user = await userFactory({ isAccountVerified: false, password: origPassword });

    const tokenDoc = await createVerificationToken(user._id!.toString(), 'token-one-abc');

    const newPassword = 'N3w!Passw0rd';
    const res = await client
      .post(`/api/v1/password/reset-password/${user._id}/${tokenDoc.token}`)
      .send({ password: newPassword })
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.success).toBe(true);

    const afterToken = await VerificationToken.findOne({ userId: user._id });
    expect(afterToken).toBeNull();

    await client
      .post(`/api/v1/password/reset-password/${user._id}/${tokenDoc.token}`)
      .send({ password: 'Another1!' })
      .expect(400);

    const login = await client.post('/api/v1/auth/login').send({ email: user.email, password: newPassword }).expect(200);
    expect(login.body.token).toBeDefined();
  });

  test('when multiple tokens exist, using one token deletes only that token; other token remains valid and can be used later', async () => {
    const user = await userFactory({ isAccountVerified: false });
    const tokA = await createVerificationToken(user._id!.toString(), 'tok-A-111');
    const tokB = await createVerificationToken(user._id!.toString(), 'tok-B-222');

    const allBefore = await VerificationToken.find({ userId: user._id });
    expect(allBefore.length).toBeGreaterThanOrEqual(2);

    const pw1 = 'FirstR3set!';
    await client
      .post(`/api/v1/password/reset-password/${user._id}/${tokA.token}`)
      .send({ password: pw1 })
      .expect(200);

    const findA = await VerificationToken.findOne({ token: tokA.token });
    const findB = await VerificationToken.findOne({ token: tokB.token });
    expect(findA).toBeNull();
    expect(findB).toBeTruthy();

    const pw2 = 'SecondR3set!';
    await client
      .post(`/api/v1/password/reset-password/${user._id}/${tokB.token}`)
      .send({ password: pw2 })
      .expect(200);

    const afterAll = await VerificationToken.find({ userId: user._id });
    expect(afterAll.length).toBe(0);

    const login = await client.post('/api/v1/auth/login').send({ email: user.email, password: pw2 }).expect(200);
    expect(login.body.token).toBeDefined();
  });

  test('attempting to reuse an already-deleted token does not change password and returns 400', async () => {
    const user = await userFactory({ isAccountVerified: false, password: 'StartP@ss1' });
    const tok = await createVerificationToken(user._id!.toString(), 'single-reuse-xyz');

    const firstNew = 'ResetOne1!';
    await client
      .post(`/api/v1/password/reset-password/${user._id}/${tok.token}`)
      .send({ password: firstNew })
      .expect(200);

    await client
      .post(`/api/v1/password/reset-password/${user._id}/${tok.token}`)
      .send({ password: 'ResetTwo2!' })
      .expect(400);

    const ok = await client.post('/api/v1/auth/login').send({ email: user.email, password: firstNew }).expect(200);
    expect(ok.body.token).toBeDefined();
  });
});