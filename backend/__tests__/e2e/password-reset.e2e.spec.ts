import { getE2EAgent } from '../../tests/helpers/e2eClient.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import { getMockModule } from '../../tests/helpers/getMockModule.js';
import { userFactory } from '../../tests/helpers/factories.js';
import VerificationToken from '../../src/models/VerificationToken.js';

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('E2E — Password reset using email preview URL / token', () => {
  test('request reset -> email sent -> preview url / token used -> reset -> login with new password', async () => {
    const client = getE2EAgent();

    // Create a user directly (verified)
    const passwordBefore = 'OldP@ssw0rd1';
    const user = await userFactory({ isAccountVerified: true, password: passwordBefore });

    // Request reset link
    const reqRes = await client
      .post('/api/v1/password/reset-password-link')
      .send({ email: user.email })
      .expect(200);

    expect(reqRes.body).toBeDefined();
    expect(reqRes.body.message).toMatch(/password reset link/i);

    // nodemailer mock was called
    const nodemailerMock: any = await getMockModule('nodemailer');
    expect(nodemailerMock.__mockSendMail).toHaveBeenCalled();

    // Option A: read token directly from DB
    const tokenRec = await VerificationToken.findOne({ userId: user._id });
    expect(tokenRec).toBeTruthy();
    const token = tokenRec!.token;
    expect(typeof token).toBe('string');

    // Option B: extract preview URL from nodemailer mock (optional)
    // The mock's sendMail returns a Promise that resolves to info (mocked). We can await that.
    const mockCall = nodemailerMock.__mockSendMail.mock.results[0];
    if (mockCall && mockCall.value) {
      // mockCall.value is the Promise returned by sendMail
      const info = await mockCall.value; // resolves to the mocked info object
      const preview = nodemailerMock.getTestMessageUrl(info);
      expect(typeof preview).toBe('string');
      expect(preview).toContain(String(info.messageId));
      // (We won't rely on the preview for the reset token in this test; it's just a sanity check.)
    }

    // 1) Validate GET reset-url works
    await client.get(`/api/v1/password/reset-password/${user._id}/${token}`).expect(200);

    // 2) POST new password
    const newPassword = 'N3w!Secur3Pwd';
    const resetRes = await client
      .post(`/api/v1/password/reset-password/${user._id}/${token}`)
      .send({ password: newPassword })
      .expect(200);

    expect(resetRes.body).toBeDefined();
    expect(resetRes.body.success).toBe(true);
    expect(resetRes.body.message).toMatch(/reset successfully|please log in/i);

    // Token deleted from DB
    const after = await VerificationToken.findOne({ userId: user._id });
    expect(after).toBeNull();

    // 3) Login with new password
    const login = await client
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: newPassword })
      .expect(200);

    expect(login.body).toBeDefined();
    expect(login.body.token).toBeDefined();
    expect(typeof login.body.token).toBe('string');
  });
});