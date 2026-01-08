import { getE2EAgent } from '../../tests/helpers/e2eClient.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import { getVerificationTokenForUser } from '../../tests/helpers/auth.js';
import { createPngBuffer } from '../../tests/helpers/fileHelpers.js';
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

describe('E2E — full user journey: admin category -> user post w/image -> comment -> like -> fetch', () => {
  test('admin creates category; user creates post with image; comment + like + fetch show correct population and side-effects', async () => {
    // Agents (simulate two browsers)
    const agentA = getE2EAgent(); // will be admin
    const agentB = getE2EAgent(); // will be regular user

    // -------------------------
    // 1) Register & verify Admin (agentA)
    // -------------------------
    const adminEmail = `e2e-admin-${Date.now()}@test.local`;
    const adminName = `admin-${Date.now()}`;
    const adminPass = 'Aa1!password';

    await agentA.post('/api/v1/auth/register').send({
      username: adminName,
      email: adminEmail,
      password: adminPass,
    }).expect(201);

    // nodemailer called for admin registration
    const nodemailerMock: any = await getMockModule('nodemailer');
    expect(nodemailerMock.__mockSendMail).toHaveBeenCalled();

    // Admin user exists and is unverified initially
    const adminRec = await User.findOne({ email: adminEmail });
    expect(adminRec).toBeTruthy();
    expect(adminRec!.isAccountVerified).toBe(false);

    // Fetch verification token and hit verification endpoint
    const adminToken = await getVerificationTokenForUser(adminRec!._id!.toString());
    expect(adminToken).toBeTruthy();

    await agentA.get(`/api/v1/auth/${adminRec!._id}/verify/${adminToken}`).expect(200);

    // Verify token removed & user marked verified
    const afterAdminToken = await VerificationToken.findOne({ userId: adminRec!._id });
    expect(afterAdminToken).toBeNull();

    const freshAdmin = await User.findById(adminRec!._id);
    expect(freshAdmin).toBeTruthy();
    expect(freshAdmin!.isAccountVerified).toBe(true);

    // Login admin
    const loginAdminRes = await agentA.post('/api/v1/auth/login').send({
      email: adminEmail,
      password: adminPass,
    }).expect(200);
    expect(loginAdminRes.body).toBeDefined();
    const adminJwt = loginAdminRes.body.token as string;
    expect(typeof adminJwt).toBe('string');
    const adminUser = loginAdminRes.body.user;
    expect(adminUser).toBeDefined();
    // set Authorization header for agentA (we cast to any for TS)
    (agentA as any).set('Authorization', `Bearer ${adminJwt}`);

    // -------------------------
    // 2) Admin creates a category
    // -------------------------
    const categoryTitle = `E2E Category ${Date.now()}`;
    const catRes = await agentA.post('/api/v1/categories').send({ title: categoryTitle }).expect(201);
    expect(catRes.body).toBeDefined();
    expect(catRes.body.title).toBe(categoryTitle);
    const createdCategoryId = catRes.body._id ?? catRes.body.id ?? catRes.body._id;

    // -------------------------
    // 3) Register & verify regular user (agentB)
    // -------------------------
    const userEmail = `e2e-user-${Date.now()}@test.local`;
    const userName = `user-${Date.now()}`;
    const userPass = 'Aa1!password';

    await agentB.post('/api/v1/auth/register').send({
      username: userName,
      email: userEmail,
      password: userPass,
    }).expect(201);

    // nodemailer should have been called again
    expect(nodemailerMock.__mockSendMail).toHaveBeenCalled();

    const userRec = await User.findOne({ email: userEmail });
    expect(userRec).toBeTruthy();
    expect(userRec!.isAccountVerified).toBe(false);

    const userToken = await getVerificationTokenForUser(userRec!._id!.toString());
    expect(userToken).toBeTruthy();

    await agentB.get(`/api/v1/auth/${userRec!._id}/verify/${userToken}`).expect(200);

    const afterUserToken = await VerificationToken.findOne({ userId: userRec!._id });
    expect(afterUserToken).toBeNull();

    const freshUser = await User.findById(userRec!._id);
    expect(freshUser).toBeTruthy();
    expect(freshUser!.isAccountVerified).toBe(true);

    const loginUserRes = await agentB.post('/api/v1/auth/login').send({
      email: userEmail,
      password: userPass,
    }).expect(200);
    const userJwt = loginUserRes.body.token as string;
    expect(typeof userJwt).toBe('string');
    const userObj = loginUserRes.body.user;
    expect(userObj).toBeDefined();
    (agentB as any).set('Authorization', `Bearer ${userJwt}`);

    // -------------------------
    // 4) User B creates a post with an image (multipart)
    // -------------------------
    const title = 'E2E Post Title';
    const description = 'This is a test post created during e2e flow. It is long enough.';
    const imgBuffer = createPngBuffer();

    // Ensure cloudinary mock counters are reset
    const cloudinaryMock: any = await getMockModule('cloudinary');
    cloudinaryMock.__uploadStreamSpy.mockClear();

    const postRes = await agentB
      .post('/api/v1/posts')
      .field('title', title)
      .field('description', description)
      .field('categoryId', createdCategoryId)
      .attach('image', imgBuffer, { filename: 'post.png', contentType: 'image/png' } as any)
      .expect(201);

    expect(postRes.body).toBeDefined();
    expect(postRes.body.title).toBe(title);
    // populated user and categoryId should be present
    expect(postRes.body.user).toBeDefined();
    expect(postRes.body.categoryId).toBeDefined();
    const createdPostId = postRes.body._id ?? postRes.body.id ?? postRes.body;

    // Cloudinary upload should have been invoked during post creation
    expect(cloudinaryMock.__uploadStreamSpy.mock.calls.length).toBeGreaterThan(0);

    // -------------------------
    // 5) Admin posts a comment on the user's post
    // -------------------------
    const commentText = 'Nice post, congrats!';
    const commentRes = await agentA.post('/api/v1/comments').send({
      postId: createdPostId,
      text: commentText,
    }).expect(201);

    expect(commentRes.body).toBeDefined();
    expect(commentRes.body.text).toBe(commentText);
    expect(commentRes.body.postId.toString()).toBe(createdPostId.toString());

    // -------------------------
    // 6) User B toggles like
    // -------------------------
    const likeRes = await agentB.patch(`/api/v1/posts/like/${createdPostId}`).expect(200);
    expect(likeRes.body).toBeDefined();
    // likes should include the user id of userB
    const likesArr: string[] = (likeRes.body.likes ?? []).map(String);
    expect(likesArr).toContain((userObj._id ?? userObj.id ?? userRec!._id).toString());

    // -------------------------
    // 7) Fetch post and assert comments populated and like present
    // -------------------------
    const fetched = await agentB.get(`/api/v1/posts/${createdPostId}`).expect(200);
    expect(fetched.body).toBeDefined();
    // comments population
    expect(Array.isArray(fetched.body.comments)).toBe(true);
    const foundComment = fetched.body.comments.find((c: any) => String(c.text) === commentText);
    expect(foundComment).toBeDefined();
    // like present in fetched post
    const fetchedLikes: string[] = (fetched.body.likes ?? []).map(String);
    expect(fetchedLikes).toContain((userObj._id ?? userObj.id ?? userRec!._id).toString());
  });
});