import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const ORIGINAL_ENV: Record<string, string | undefined> = { ...process.env };

async function startServerWithEnv(nodeEnv: 'production' | 'test', mongoUri: string) {
  // Set env BEFORE importing app so src/env.ts parses the desired values
  process.env.NODE_ENV = nodeEnv;
  process.env.MONGO_URI = mongoUri;

  // Provide safe defaults required by env parsing in non-test mode
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'x'.repeat(40);
  process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? 'dummy';
  process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY ?? 'dummy';
  process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET ?? 'dummy';
  process.env.APP_EMAIL_ADDRESS = process.env.APP_EMAIL_ADDRESS ?? 'test@example.com';
  process.env.APP_EMAIL_PASSWORD = process.env.APP_EMAIL_PASSWORD ?? 'password';

  // copies of modules like `mongoose` in the same process and break DB ops.
  const mod = await import('../../src/app.js');
  const app = mod.default;

  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', (err) => reject(err));
  });

  return { app, server };
}

async function stopServer(server: any) {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err?: Error) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function createVerifiedUserAndLogin(
  agent: request.SuperTest<request.Test>,
  email: string,
  username: string,
  password: string,
) {
  // Import models now (after mongoose connection exists)
  const { default: User } = await import('../../src/models/User.js');

  const created = new User({
    username,
    email,
    password,
    isAccountVerified: true,
  });
  await created.save();

  // login via HTTP to exercise real auth
  const loginRes = await agent
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);

  const token = loginRes.body?.token as string | undefined;
  if (!token) {
    throw new Error('Login did not return a token');
  }

  // Return both DB-created user and token for subsequent requests
  return { created, token };
}

describe('E2E — Cookie flags: production vs test', () => {
  let mongod: MongoMemoryServer | null = null;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();

    // If mongoose already has an open connection, disconnect it first.
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch {
        // ignore
      }
    }

    await mongoose.connect(mongod.getUri(), { dbName: 'e2e-cookies' });
  });

  afterAll(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
    if (mongod) await mongod.stop();

    process.env = { ...ORIGINAL_ENV };
  });

  test('logout Set-Cookie includes Secure in production and omits Secure in test', async () => {
    if (!mongod) throw new Error('mongod not started');

    const mongoUri = mongod.getUri();

    let prodServer: any | null = null;
    let testServer: any | null = null;

    try {
      // -------- Production run --------
      ({ server: prodServer } = await startServerWithEnv('production', mongoUri));
      const prodAgent = request.agent(prodServer) as unknown as request.SuperTest<request.Test>;

      const emailProd = `e2e-prod-${Date.now()}@test.local`;
      const usernameProd = `e2e-prod-${Date.now()}`;
      const password = 'Aa1!password';

      const { created, token } = await createVerifiedUserAndLogin(prodAgent, emailProd, usernameProd, password);

      // attach token on the logout request
      const logoutRes = await prodAgent
        .post(`/api/v1/auth/logout/${created._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const setCookieProd = logoutRes.headers['set-cookie'];
      expect(setCookieProd).toBeDefined();
      const joinedProd = Array.isArray(setCookieProd) ? setCookieProd.join(';') : String(setCookieProd);
      const lowerProd = joinedProd.toLowerCase();

      expect(lowerProd).toMatch(/\bsecure\b/);
      expect(lowerProd).toContain('httponly');
      expect(lowerProd).toContain('userinfo=');

      await stopServer(prodServer);
      prodServer = null;

      // -------- Test run --------
      ({ server: testServer } = await startServerWithEnv('test', mongoUri));
      const testAgent = request.agent(testServer) as unknown as request.SuperTest<request.Test>;

      const emailTest = `e2e-test-${Date.now()}@test.local`;
      const usernameTest = `e2e-test-${Date.now()}`;

      const { created: createdTest, token: tokenTest } = await createVerifiedUserAndLogin(testAgent, emailTest, usernameTest, password);

      const logoutTestRes = await testAgent
        .post(`/api/v1/auth/logout/${createdTest._id}`)
        .set('Authorization', `Bearer ${tokenTest}`)
        .expect(200);

      const setCookieTest = logoutTestRes.headers['set-cookie'];
      expect(setCookieTest).toBeDefined();
      const joinedTest = Array.isArray(setCookieTest) ? setCookieTest.join(';') : String(setCookieTest);
      const lowerTest = joinedTest.toLowerCase();

      expect(lowerTest).not.toMatch(/\bsecure\b/);
      expect(lowerTest).toContain('httponly');
      expect(lowerTest).toContain('userinfo=');

      await stopServer(testServer);
      testServer = null;
    } finally {
      // Ensure servers are closed even if something failed
      if (prodServer) await stopServer(prodServer);
      if (testServer) await stopServer(testServer);
    }
  }, 30000);
});