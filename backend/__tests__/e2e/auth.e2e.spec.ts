import { getE2EAgent } from '../../tests/helpers/e2eClient.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import { getVerificationTokenForUser } from '../../tests/helpers/auth.js';
import { getMockModule } from '../../tests/helpers/getMockModule.js';
import User from '../../src/models/User.js';
import VerificationToken from '../../src/models/VerificationToken.js';

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('Auth E2E — full registration -> verify -> login -> logout', () => {
  test('register -> verify -> login -> get /users/me -> logout (cookies cleared)', async () => {
    const agent = getE2EAgent();

    const email = `e2e-reg-${Date.now()}@test.local`;
    const username = `e2euser-${Date.now()}`;
    const password = 'Aa1!password';

    // 1) Register
    const regRes = await agent
      .post('/api/v1/auth/register')
      .send({ username, email, password })
      .expect(201);

    expect(regRes.body).toBeDefined();

    // nodemailer should have been called to send the verification email
    const nodemailerMock: any = await getMockModule('nodemailer');
    expect(nodemailerMock.__mockSendMail).toHaveBeenCalled();

    // 2) Ensure the user exists and is not verified yet
    const created = await User.findOne({ email });
    expect(created).toBeTruthy();
    expect(created!.isAccountVerified).toBe(false);

    // 3) Get verification token
    const token = await getVerificationTokenForUser(created!._id!.toString());
    expect(token).toBeTruthy();

    // 4) Verify account via endpoint
    await agent
      .get(`/api/v1/auth/${created!._id}/verify/${token}`)
      .expect(200);

    // Token should be removed and user marked verified
    const afterToken = await VerificationToken.findOne({ userId: created!._id });
    expect(afterToken).toBeNull();

    const freshUser = await User.findById(created!._id);
    expect(freshUser).toBeTruthy();
    expect(freshUser!.isAccountVerified).toBe(true);

    // 5) Login
    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    expect(loginRes.body).toBeDefined();
    const tokenJwt = loginRes.body.token as string | undefined;
    expect(typeof tokenJwt).toBe('string');

    // Use Authorization header for subsequent agent requests
    (agent as any).set('Authorization', `Bearer ${tokenJwt}`);

    // 6) GET /users/me (protected)
    const me = await agent.get('/api/v1/users/me').expect(200);
    expect(me.body).toBeDefined();
    expect(me.body.status).toBe(true);
    expect(me.body.result).toBeDefined();
    // basic sanity: returned id/email matches
    const returned = me.body.result;
    expect(returned.email).toBe(email);
    expect(returned.username).toBeDefined();

    // 7) Logout (uses token to identify user in middleware)
    const logoutRes = await agent.post(`/api/v1/auth/logout/${created!._id}`).expect(200);
    expect(logoutRes.body).toBeDefined();
    expect(logoutRes.body.message).toMatch(/logged out/i);

    // Logout should set cookies to clear authToken and userInfo
    const setCookie = logoutRes.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const joined = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(joined).toMatch(/authToken=;|authToken=;/i);
    expect(joined).toMatch(/userInfo=;|userInfo=;/i);
  });
});