import request from 'supertest';
import app from '../../src/app.js';
import {
  userFactory,
  createVerificationToken,
} from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import { getMockModule } from '../../tests/helpers/getMockModule.js';
import User from '../../src/models/User.js';
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

describe('Password Reset Flow — integration', () => {
  test('POST /password/reset-password-link: existing user -> creates token and sends email', async () => {
    const user = await userFactory({ isAccountVerified: true });
    const res = await client
      .post('/api/v1/password/reset-password-link')
      .send({ email: user.email })
      .expect(200);

    expect(res.body.message).toMatch(/password reset link/i);

    const tokenRec = await VerificationToken.findOne({ userId: user._id });
    expect(tokenRec).toBeTruthy();
    expect(typeof tokenRec!.token).toBe('string');

    const nodemailerMock = await getMockModule('nodemailer');
    expect(nodemailerMock.__mockSendMail).toHaveBeenCalled();
    const mailArgs = nodemailerMock.__mockSendMail.mock.calls[0][0];
    expect((mailArgs.html || mailArgs.text) as string).toMatch(/reset-password/i);
  });

  test('POST /password/reset-password-link: non-existing email -> 404', async () => {
    const res = await client
      .post('/api/v1/password/reset-password-link')
      .send({ email: `no-one-${Date.now()}@test.local` })
      .expect(404);

    expect(res.body.message).toMatch(/does not exist/i);
    const tokens = await VerificationToken.find({});
    expect(tokens.length).toBe(0);
  });

  test('GET /password/reset-password/:userId/:token -> valid token returns 200', async () => {
    const user = await userFactory({ isAccountVerified: false });
    const tokenDoc = await createVerificationToken(user._id!.toString(), 'tok-123');
    const res = await client
      .get(`/api/v1/password/reset-password/${user._id}/${tokenDoc.token}`)
      .expect(200);

    expect(res.body.message).toMatch(/valid url/i);
  });

  test('GET /password/reset-password/:userId/:token -> invalid token returns 400', async () => {
    const user = await userFactory();
    await createVerificationToken(user._id!.toString(), 'real-token');

    await client
      .get(`/api/v1/password/reset-password/${user._id}/wrong-token`)
      .expect(400);
  });

  test('POST /password/reset-password/:userId/:token -> valid reset updates password, deletes token and allows login', async () => {
    const rawPassword = 'OldP@ssw0rd1';
    const user = await userFactory({ isAccountVerified: false, password: rawPassword });
    const tokenDoc = await createVerificationToken(user._id!.toString(), 'reset-token-xyz');

    const newPassword = 'N3w!Secur3Pwd';

    const res = await client
      .post(`/api/v1/password/reset-password/${user._id}/${tokenDoc.token}`)
      .send({ password: newPassword })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/Passsword has been reset successfully, please log in/i);

    const afterToken = await VerificationToken.findOne({ userId: user._id });
    expect(afterToken).toBeNull();

    const fresh = await User.findById(user._id);
    expect(fresh).toBeTruthy();
    expect(fresh!.isAccountVerified).toBe(true);

    const login = await client
      .post('/api/v1/auth/login')
      .send({ email: fresh!.email, password: newPassword })
      .expect(200);

    expect(login.body.token).toBeDefined();
  });

  test('POST /password/reset-password/:userId/:token -> invalid token returns 400 and does not change password', async () => {
    const origPassword = 'OrigP@ss1';
    const user = await userFactory({ isAccountVerified: true, password: origPassword });
    await createVerificationToken(user._id!.toString(), 'real-token-abc');

    await client
      .post(`/api/v1/password/reset-password/${user._id}/wrong-token`)
      .send({ password: 'Another1!' })
      .expect(400);

    const login = await client
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: origPassword })
      .expect(200);

    expect(login.body.token).toBeDefined();
  });

  test('POST /password/reset-password/:userId/:token -> weak password (validation) returns 400', async () => {
    const user = await userFactory({ isAccountVerified: true });
    const tokenDoc = await createVerificationToken(user._id!.toString(), 'tok-weak');

    const weak = 'weakpass';
    const res = await client
      .post(`/api/v1/password/reset-password/${user._id}/${tokenDoc.token}`)
      .send({ password: weak })
      .expect(400);

    const still = await VerificationToken.findOne({ userId: user._id });
    expect(still).toBeTruthy();

    expect(res.body).toHaveProperty('errors');
  });

  test('GET/POST with malformed userId returns 400 (validateObjectIdParam)', async () => {
    await client.get('/api/v1/password/reset-password/not-an-objectid/sometoken').expect(400);
    await client.post('/api/v1/password/reset-password/not-an-objectid/sometoken').send({ password: 'S0m3P@ss!' }).expect(400);
  });
});