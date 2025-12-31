import request from 'supertest';
import app from '../../src/app.js';
import { registerAndLogin } from '../../tests/helpers/auth.js';
import { userFactory, postFactory, categoryFactory } from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import User from '../../src/models/User.js';
import Post from '../../src/models/Post.js';
import Comment from '../../src/models/Comment.js';

const client = request(app);

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('XSS / sanitization integration tests', () => {
  test('POST /api/v1/posts: script tags and onerror attributes removed; allowed <p> and <strong> preserved', async () => {
    const { user, authHeader } = await registerAndLogin(undefined, { username: `xss-user-${Date.now()}` });

    const title = 'Nice title <script>alert("x")</script>';
    const description =
      '<p>Hello <strong>bold</strong></p>' +
      '<img src="x" onerror="alert(1)">' +
      '<script>evil()</script>' +
      '<p>End</p>';
    const category = await categoryFactory({ user: (user as any)._id });

    const res = await client
      .post('/api/v1/posts')
      .set(authHeader)
      .field('title', title)
      .field('description', description)
      .field('categoryId', (category as any)._id.toString())
      .expect(201);

    expect(res.body).toBeDefined();
    const respTitle = String(res.body.title || '');
    const respDesc = String(res.body.description || '');

    expect(respTitle.toLowerCase()).not.toContain('<script');
    expect(respDesc.toLowerCase()).not.toContain('<script');
    expect(respDesc.toLowerCase()).not.toContain('onerror');

    expect(respDesc).toContain('<p>');
    expect(respDesc).toContain('<strong>');

    const stored = await Post.findById(res.body._id);
    expect(stored).toBeTruthy();
    const storedDesc = String((stored as any).description ?? '');
    expect(storedDesc.toLowerCase()).not.toContain('<script');
    expect(storedDesc.toLowerCase()).not.toContain('onerror');
    expect(storedDesc).toContain('<p>');
    expect(storedDesc).toContain('<strong>');
  });

  test('POST /api/v1/auth/register: username containing script tags is sanitized in DB', async () => {
    const rawUsername = `bad<script>evil()</script>name-${Date.now()}`;
    const email = `xss-${Date.now()}@test.local`;
    const password = 'Aa1!password';

    await client
      .post('/api/v1/auth/register')
      .send({ username: rawUsername, email, password })
      .expect(201);

    const u = await User.findOne({ email });
    expect(u).toBeTruthy();
    const storedName = String((u as any).username);
    expect(storedName.toLowerCase()).not.toContain('<script');
    expect(storedName).toContain('bad');
    expect(storedName).toContain('name');
  });

  test('POST /api/v1/comments: comment text and username sanitized (no <script>, no onerror)', async () => {
    const email = `cmt-${Date.now()}@test.local`;
    const password = 'Aa1!password';
    const rawUsername = `comm<script>alert(1)</script>er`;

    await client.post('/api/v1/auth/register').send({ username: rawUsername, email, password }).expect(201);
    const created = await User.findOne({ email });
    expect(created).toBeTruthy();
    created!.isAccountVerified = true;
    await created!.save();

    const login = await client.post('/api/v1/auth/login').send({ email, password }).expect(200);
    const token = login.body.token as string;
    const authHeader = { Authorization: `Bearer ${token}` };

    const categoryOwner = await userFactory();
    const category = await categoryFactory({ user: (categoryOwner as any)._id });
    const p = await postFactory({ user: (categoryOwner as any)._id, categoryId: (category as any)._id });

    const maliciousText = '<script>bad()</script>Nice comment<img src=x onerror=evil()>';
    const res = await client
      .post('/api/v1/comments')
      .set(authHeader)
      .send({ postId: (p as any)._id.toString(), text: maliciousText })
      .expect(201);

    expect(res.body).toBeDefined();
    const returnedText = String(res.body.text || '');
    const returnedUsername = String(res.body.username || '');

    expect(returnedText.toLowerCase()).not.toContain('<script');
    expect(returnedText.toLowerCase()).not.toContain('onerror');

    expect(returnedUsername.toLowerCase()).not.toContain('<script');

    const stored = await Comment.findById(res.body._id);
    expect(stored).toBeTruthy();
    const storedText = String((stored as any).text || '');
    expect(storedText.toLowerCase()).not.toContain('<script');
    expect(storedText.toLowerCase()).not.toContain('onerror');
  });
});