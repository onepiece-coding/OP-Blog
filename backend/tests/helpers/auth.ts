import supertest from 'supertest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app.js';
import { env } from '../../src/env.js';
import User from '../../src/models/User.js';
import VerificationToken from '../../src/models/VerificationToken.js';

export async function loginAndGetToken(
  agent: supertest.SuperTest<supertest.Test> | undefined,
  email: string,
  password: string,
) {
  const client = agent ?? request(app);
  const res = await client.post('/api/v1/auth/login').send({ email, password });
  if (res.status >= 400) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}


export async function registerAndLogin(
  agent: supertest.SuperTest<supertest.Test> | undefined,
  {
    username,
    email,
    password,
    isAdmin = false,
  }: { username?: string; email?: string; password?: string; isAdmin?: boolean } = {},
) {
  const client = agent ?? request(app);
  const passwordPlain = password ?? 'Aa1!password';

  const body = {
    username: username ?? `t-${Math.random().toString(36).slice(2, 8)}`,
    email: email ?? `t-${Date.now()}@example.com`,
    password: passwordPlain,
    isAdmin,
  };

  const regRes = await client.post('/api/v1/auth/register').send(body);
  if (regRes.status >= 400) {
    throw new Error(`Register failed: ${regRes.status} ${JSON.stringify(regRes.body)}`);
  }

  const created = await User.findOne({ email: body.email });
  if (!created) throw new Error('User not found after register');

  created.isAccountVerified = true;
  await created.save();

  const loginRes = await client
    .post('/api/v1/auth/login')
    .send({ email: body.email, password: passwordPlain });

  if (loginRes.status >= 400) {
    throw new Error(`Login after register failed: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }

  const token = loginRes.body.token as string;
  return {
    user: loginRes.body.user ?? created,
    token,
    authHeader: { Authorization: `Bearer ${token}` },
  };
}

export async function getVerificationTokenForUser(userId: string) {
  const rec = await VerificationToken.findOne({ userId });
  return rec?.token ?? null;
}

export function createJwtForUser(user: { _id: any; isAdmin?: boolean }) {
  const payload = { id: user._id.toString(), isAdmin: Boolean(user.isAdmin) };
  return jwt.sign(payload, env.JWT_SECRET!, { expiresIn: '7d' });
}