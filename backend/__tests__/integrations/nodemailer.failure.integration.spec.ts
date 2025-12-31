import request from 'supertest';
import app from '../../src/app.js';
import { userFactory } from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import VerificationToken from '../../src/models/VerificationToken.js';
import User from '../../src/models/User.js';
import { getMockModule } from '../../tests/helpers/getMockModule.js';

import logger from '../../src/utils/logger.js';
import { jest } from '@jest/globals';

jest.spyOn(logger, 'error').mockImplementation(() => {});
jest.spyOn(logger, 'info').mockImplementation(() => {});
jest.spyOn(logger, 'warn').mockImplementation(() => {});
jest.spyOn(logger, 'debug').mockImplementation(() => {});

const client = request(app);

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('Nodemailer failure handling (integration)', () => {
  test('register: when sendMail rejects -> endpoint errors (5xx) and user+token exist in DB', async () => {
    const nodemailerMock: any = await getMockModule('nodemailer');
    nodemailerMock.__mockSendMail.mockRejectedValueOnce(new Error('simulated nodemailer outage'));

    const email = `reg-fail-${Date.now()}@test.local`;
    const payload = { username: 'regfail', email, password: 'Aa1!password' };

    const res = await client.post('/api/v1/auth/register').send(payload);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body).toHaveProperty('message');

    const user = await User.findOne({ email });
    expect(user).toBeTruthy();

    const tokenRec = await VerificationToken.findOne({ userId: user!._id });
    expect(tokenRec).toBeTruthy();
  });

  test('login unverified flow: when sendMail rejects -> endpoint errors (5xx) and token created', async () => {
    const pw = 'Aa1!password';
    const user = await userFactory({ isAccountVerified: false, password: pw });

    const nodemailerMock: any = await getMockModule('nodemailer');
    nodemailerMock.__mockSendMail.mockRejectedValueOnce(new Error('simulated nodemailer outage'));

    const res = await client.post('/api/v1/auth/login').send({ email: user.email, password: pw });

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body).toHaveProperty('message');

    const tokenRec = await VerificationToken.findOne({ userId: user._id });
    expect(tokenRec).toBeTruthy();
  });

  test('password reset link: when sendMail rejects -> endpoint errors (5xx) and token exists', async () => {
    const user = await userFactory({ isAccountVerified: true });

    const nodemailerMock: any = await getMockModule('nodemailer');
    nodemailerMock.__mockSendMail.mockRejectedValueOnce(new Error('simulated nodemailer outage'));

    const res = await client.post('/api/v1/password/reset-password-link').send({ email: user.email });

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body).toHaveProperty('message');

    const tokenRec = await VerificationToken.findOne({ userId: user._id });
    expect(tokenRec).toBeTruthy();
  });
});