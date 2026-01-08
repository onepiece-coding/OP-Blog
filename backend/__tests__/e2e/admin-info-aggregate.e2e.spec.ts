import { getE2EAgent } from '../../tests/helpers/e2eClient.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import { getVerificationTokenForUser } from '../../tests/helpers/auth.js';
import { createPngBuffer } from '../../tests/helpers/fileHelpers.js';
import { getMockModule } from '../../tests/helpers/getMockModule.js';
import User from '../../src/models/User.js';

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('E2E — Admin info aggregate correctness (all created via HTTP)', () => {
  test('counts returned by /api/v1/admin/info reflect HTTP-created users, posts, categories, comments', async () => {
    const nodemailerMock: any = await getMockModule('nodemailer');
    const cloudinaryMock: any = await getMockModule('cloudinary');

    // Agents (simulate browsers)
    const adminAgent = getE2EAgent();

    // -------------------------
    // 1) Register first user (becomes admin) and verify via HTTP
    // -------------------------
    const adminEmail = `admin-e2e-${Date.now()}@test.local`;
    const adminName = `admin-e2e-${Date.now()}`;
    const adminPass = 'Aa1!password';

    await adminAgent
      .post('/api/v1/auth/register')
      .send({ username: adminName, email: adminEmail, password: adminPass })
      .expect(201);

    // nodemailer should have been called for admin registration
    expect(nodemailerMock.__mockSendMail).toHaveBeenCalled();

    const adminRec = await User.findOne({ email: adminEmail });
    expect(adminRec).toBeTruthy();

    // Verify admin via token from DB
    const adminToken = await getVerificationTokenForUser(adminRec!._id!.toString());
    expect(adminToken).toBeTruthy();
    await adminAgent.get(`/api/v1/auth/${adminRec!._id}/verify/${adminToken}`).expect(200);

    // Login admin and set auth header on agent
    const loginAdmin = await adminAgent
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: adminPass })
      .expect(200);
    const adminJwt = loginAdmin.body.token as string;
    (adminAgent as any).set('Authorization', `Bearer ${adminJwt}`);

    // -------------------------
    // 2) Create additional users via HTTP (some verified, one left unverified)
    // -------------------------
    const totalExtraUsers = 3; // will create 3 extra users
    const usersAgents = [];
    const usersInfo: Array<{ email: string; agent: any; id?: string }> = [];

    for (let i = 0; i < totalExtraUsers; i++) {
      const a = getE2EAgent();
      const email = `user${i}-e2e-${Date.now()}@test.local`;
      const username = `user${i}-e2e-${Date.now()}`;
      const password = 'Aa1!password';

      await a.post('/api/v1/auth/register').send({ username, email, password }).expect(201);
      usersInfo.push({ email, agent: a });
      usersAgents.push(a);
    }

    // nodemailer should have been called for every registration
    expect(nodemailerMock.__mockSendMail.mock.calls.length).toBeGreaterThanOrEqual(1);

    // Verify two of the extra users (leave one unverified)
    const toVerifyCount = 2;
    for (let i = 0; i < toVerifyCount; i++) {
      const rec = await User.findOne({ email: usersInfo[i].email });
      expect(rec).toBeTruthy();
      const token = await getVerificationTokenForUser(rec!._id!.toString());
      expect(token).toBeTruthy();
      await usersInfo[i].agent.get(`/api/v1/auth/${rec!._id}/verify/${token}`).expect(200);
      usersInfo[i].id = rec!._id!.toString();
    }
    // keep usersInfo[2] unverified (no token call)

    // Login verified users and set Authorization header
    for (let i = 0; i < toVerifyCount; i++) {
      const password = 'Aa1!password';
      const res = await usersInfo[i].agent.post('/api/v1/auth/login').send({ email: usersInfo[i].email, password }).expect(200);
      const jwt = res.body.token as string;
      (usersInfo[i].agent as any).set('Authorization', `Bearer ${jwt}`);
      // if id not set, set it from response user
      usersInfo[i].id = usersInfo[i].id ?? (res.body.user?._id ?? res.body.user?.id);
    }

    // -------------------------
    // 3) Admin creates categories via HTTP
    // -------------------------
    const categoryTitles = [`cat-A-${Date.now()}`, `cat-B-${Date.now()}`];

    for (const t of categoryTitles) {
      const r = await adminAgent.post('/api/v1/categories').send({ title: t }).expect(201);
      expect(r.body.title).toBe(t);
    }

    // -------------------------
    // 4) Verified users create posts (some with images)
    // -------------------------
    // Use the two verified users (usersInfo[0], usersInfo[1])
    cloudinaryMock.__uploadStreamSpy.mockClear();

    const createdPosts: any[] = [];
    for (let i = 0; i < toVerifyCount; i++) {
      const ua = usersInfo[i].agent;
      (await adminAgent.get('/api/v1/categories').expect(200)).body.users?.[0]?._id ?? null;
      // create a simple post with image attached
      const postRes = await ua
        .post('/api/v1/posts')
        .field('title', `post-${i}-${Date.now()}`)
        .field('description', `some long description for post ${i}`)
        .field('categoryId', categoryTitles[0] ? ( (await adminAgent.get('/api/v1/categories').expect(200)).body.users[0]._id ) : '') // fetch first category id
        .attach('image', createPngBuffer(), { filename: `img-${i}.png`, contentType: 'image/png' } as any)
        .expect(201);

      createdPosts.push(postRes.body);
    }

    // cloudinary should have been called for each post with image
    expect(cloudinaryMock.__uploadStreamSpy.mock.calls.length).toBeGreaterThanOrEqual(toVerifyCount);

    // -------------------------
    // 5) Create comments via HTTP (mix: admin & verified users)
    // -------------------------
    // Let admin comment on first created post; user0 comment on second post (if any)
    const commentTexts = ['admin comment', 'user comment'];
    if (createdPosts.length > 0) {
      await adminAgent.post('/api/v1/comments').send({ postId: createdPosts[0]._id ?? createdPosts[0].id, text: commentTexts[0] }).expect(201);
    }
    if (createdPosts.length > 1) {
      await usersInfo[0].agent.post('/api/v1/comments').send({ postId: createdPosts[1]._id ?? createdPosts[1].id, text: commentTexts[1] }).expect(201);
    }

    // -------------------------
    // 6) Admin fetches aggregated info
    // -------------------------
    const info = await adminAgent.get('/api/v1/admin/info').expect(200);
    expect(info.body).toBeDefined();

    // expected counts:
    // users: admin + totalExtraUsers (we registered totalExtraUsers) => totalExtraUsers + 1
    const expectedUsersCount = 1 + totalExtraUsers;
    // posts: createdPosts length
    const expectedPostsCount = createdPosts.length;
    // categories: categoryTitles.length
    const expectedCategoriesCount = categoryTitles.length;
    // comments: the two we created (or less if fewer posts)
    // compute expected comments count dynamically
    let expectedCommentsCount = 0;
    if (createdPosts.length > 0) expectedCommentsCount += 1;
    if (createdPosts.length > 1) expectedCommentsCount += 1;

    expect(Number(info.body.users)).toBe(expectedUsersCount);
    expect(Number(info.body.posts)).toBe(expectedPostsCount);
    expect(Number(info.body.categories)).toBe(expectedCategoriesCount);
    expect(Number(info.body.comments)).toBe(expectedCommentsCount);
  });
});