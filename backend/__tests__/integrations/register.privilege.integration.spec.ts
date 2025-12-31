import request from 'supertest';
import app from '../../src/app.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import { userFactory } from '../../tests/helpers/factories.js';
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

describe('Registration privilege escalation protections', () => {
  test('register payload with isAdmin:true is ignored for non-first users', async () => {
    await userFactory({ username: 'existing', email: `existing-${Date.now()}@test.local` });

    const maliciousEmail = `attacker-${Date.now()}@test.local`;
    await client
      .post('/api/v1/auth/register')
      .send({
        username: 'attacker',
        email: maliciousEmail,
        password: 'Aa1!password',
        isAdmin: true,
      })
      .expect(201);

    const created = await User.findOne({ email: maliciousEmail });
    expect(created).toBeTruthy();

    expect((created as any).isAdmin).toBe(false);
  });

  test('first registered user becomes admin only due to server logic (allowed behavior)', async () => {
    await clearDatabase();

    const firstEmail = `first-${Date.now()}@test.local`;

    await client
      .post('/api/v1/auth/register')
      .send({
        username: 'firstuser',
        email: firstEmail,
        password: 'Aa1!password',
        isAdmin: true,
      })
      .expect(201);

    const created = await User.findOne({ email: firstEmail });
    expect(created).toBeTruthy();

    expect((created as any).isAdmin).toBe(true);
  });
});