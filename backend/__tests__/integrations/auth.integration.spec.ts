import request from 'supertest';
import app from '../../src/app.js';
import { registerAndLogin, getVerificationTokenForUser } from '../../tests/helpers/auth.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import { decodeToken } from '../../tests/helpers/jwtUtils.js';
import User from '../../src/models/User.js';
import VerificationToken from '../../src/models/VerificationToken.js';
import { getMockModule } from '../../tests/helpers/getMockModule.js';

const client = request(app);

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('Auth integration', () => {
  test('register creates user + verification token and sends email', async () => {
    const email = `reg-${Date.now()}@test.local`;
    const username = 'reguser';
    const password = 'Aa1!password';

    const res = await client.post('/api/v1/auth/register').send({ username, email, password }).expect(201);
    expect(res.body.message).toBeDefined();

    const user = await User.findOne({ email });
    expect(user).toBeTruthy();
    expect(user!.isAccountVerified).toBe(false);

    const tokenRec = await VerificationToken.findOne({ userId: user!._id });
    expect(tokenRec).toBeTruthy();

    const nodemailerMock = await getMockModule('nodemailer');
    expect(nodemailerMock.__mockSendMail).toHaveBeenCalled();
  });

  test('register duplicate email returns 400', async () => {
    const email = `dup-${Date.now()}@test.local`;
    await client
      .post('/api/v1/auth/register')
      .send({ username: 'userA', email, password: 'Aa1!password' })
      .expect(201);
    await client
      .post('/api/v1/auth/register')
      .send({ username: 'userB', email, password: 'Aa1!password' })
      .expect(400);
  });

  test('verify user via token endpoint', async () => {
    const email = `verify-${Date.now()}@test.local`;
    await client.post('/api/v1/auth/register').send({ username: 'verify', email, password: 'Aa1!password' }).expect(201);

    const user = await User.findOne({ email });
    expect(user).toBeTruthy();

    const token = await getVerificationTokenForUser(user!._id!.toString());
    expect(token).toBeTruthy();

    await client.get(`/api/v1/auth/${user!._id}/verify/${token}`).expect(200);

    const fresh = await User.findById(user!._id);
    expect(fresh!.isAccountVerified).toBe(true);

    const tokenAfter = await VerificationToken.findOne({ userId: user!._id });
    expect(tokenAfter).toBeNull();
  });

  test('login for verified user returns token which decodes correctly', async () => {
    const { token, authHeader } = await registerAndLogin(undefined, { username: `login-${Date.now()}` });
    expect(token).toBeTruthy();
    const payload = decodeToken(token);
    expect(payload.id).toBeTruthy();

    await client.get('/api/v1/users/me').set(authHeader).expect(200);
  });

  test('login for unverified user triggers sending verification email and responds with 400', async () => {
    const email = `unv-${Date.now()}@test.local`;
    const password = 'Aa1!password';

    await client.post('/api/v1/auth/register').send({ username: 'unv', email, password }).expect(201);

    const res = await client.post('/api/v1/auth/login').send({ email, password }).expect(400);
    expect(res.body.message).toMatch(/verification/i);

    const nodemailerMock = await getMockModule('nodemailer');
    expect(nodemailerMock.__mockSendMail).toHaveBeenCalled();
  });

  test('logout clears cookies (set-cookie header present)', async () => {
    const { user, authHeader } = await registerAndLogin(undefined, { username: `logout-${Date.now()}` });
    const res = await client.post(`/api/v1/auth/logout/${user._id}`).set(authHeader).expect(200);
    expect(res.body.message).toMatch(/logged out/i);

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const joined = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(joined).toMatch(/authToken=;|authToken=;/i);
  });

  test('register validation errors (short username, bad email, weak password)', async () => {
    const r1 = await client
      .post('/api/v1/auth/register')
      .send({ username: 'a', email: 'ok1@test.local', password: 'Aa1!password' });
    expect(r1.status).toBe(400);
    expect(r1.body).toHaveProperty('errors');

    const r2 = await client
      .post('/api/v1/auth/register')
      .send({ username: 'validname', email: 'not-an-email', password: 'Aa1!password' });
    expect(r2.status).toBe(400);
    expect(r2.body).toHaveProperty('errors');

    const r3 = await client
      .post('/api/v1/auth/register')
      .send({ username: 'validname2', email: 'ok2@test.local', password: 'weakpass' });
    expect(r3.status).toBe(400);
    expect(r3.body).toHaveProperty('errors');
  });

  test('logout clears both authToken and userInfo cookies', async () => {
    const { user, authHeader } = await registerAndLogin(undefined, { username: `logout2-${Date.now()}` });

    const res = await client.post(`/api/v1/auth/logout/${user._id}`).set(authHeader).expect(200);
    expect(res.body.message).toMatch(/logged out/i);

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const joined = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(joined).toMatch(/authToken=;|authToken=;/i);
    expect(joined).toMatch(/userInfo=;|userInfo=;/i);
  });
});