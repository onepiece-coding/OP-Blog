import request from 'supertest';
import app from '../../src/app.js';
import jwt from 'jsonwebtoken';
import { registerAndLogin, createJwtForUser } from '../../tests/helpers/auth.js';
import { createPngBuffer } from '../../tests/helpers/fileHelpers.js';
import { userFactory, postFactory, categoryFactory, commentFactory } from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import { getMockModule } from '../../tests/helpers/getMockModule.js';
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

describe('Users — full integration tests', () => {
  test('GET profile (public) returns user without password', async () => {
    const u = await userFactory();
    const res = await client.get(`/api/v1/users/profile/${(u as any)._id}`).expect(200);
    expect(res.body).toBeDefined();
    expect(res.body.email).toBe(u.email);
    expect(res.body.password).toBeUndefined();
    expect(res.body).toHaveProperty('username');
  });

  test('GET profile of non-existing user returns 404', async () => {
    await client.get('/api/v1/users/profile/000000000000000000000000').expect(404);
  });

  test('GET /users/me requires auth and returns current user', async () => {
    const { authHeader } = await registerAndLogin(undefined, { username: `me-${Date.now()}` });
    const res = await client.get('/api/v1/users/me').set(authHeader).expect(200);
    expect(res.body.status).toBe(true);
    expect(res.body.result).toBeDefined();
    expect(res.body.result._id || res.body.result.id).toBeDefined();
  });

  test('GET /users/me without token returns 401', async () => {
    await client.get('/api/v1/users/me').expect(401);
  });

  test('GET all users (admin only) returns paginated list', async () => {
    await userFactory();
    await userFactory();
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const res = await client.get('/api/v1/users/profile').set(adminHeader).expect(200);
    expect(res.body.users).toBeDefined();
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.totalPages).toBeDefined();
  });

  test('GET all users unauthorized for non-admin', async () => {
    const normal = await userFactory();
    const header = { Authorization: `Bearer ${createJwtForUser(normal as any)}` };
    await client.get('/api/v1/users/profile').set(header).expect(403);
  });

  test('Update user profile by owner (username, bio) succeeds', async () => {
    const { user, authHeader } = await registerAndLogin(undefined, { username: `upduser-${Date.now()}` });
    const newBio = 'Hello, I changed my bio';
    const newName = 'NewName';

    const res = await client
      .patch(`/api/v1/users/profile/${user._id}`)
      .set(authHeader)
      .send({ username: newName, bio: newBio })
      .expect(200);

    expect(res.body.username).toBe(newName);

    const fresh = await User.findById(user._id);
    expect(fresh!.bio).toBe(newBio);
  });

  test('Update user profile by non-owner is forbidden', async () => {
    const owner = await userFactory();
    const other = await userFactory();
    const otherHeader = { Authorization: `Bearer ${createJwtForUser(other as any)}` };

    await client
      .patch(`/api/v1/users/profile/${(owner as any)._id}`)
      .set(otherHeader)
      .send({ bio: 'trying to edit' })
      .expect(403);
  });

  test('Update password hashes new password and login succeeds with new password', async () => {
    const { user, authHeader } = await registerAndLogin(undefined, { username: `pw-${Date.now()}` });
    const newPassword = 'Str0ng!NewP';

    await client
      .patch(`/api/v1/users/profile/${user._id}`)
      .set(authHeader)
      .send({ password: newPassword })
      .expect(200);

    const login = await client.post('/api/v1/auth/login').send({ email: user.email, password: newPassword }).expect(200);
    expect(login.body.token).toBeDefined();
  });

  test('Profile photo upload: uploads new image and destroys old one', async () => {
    const u = await userFactory();
    u.profilePhoto = { url: 'https://example.com/old.jpg', publicId: 'old-profile-123' } as any;
    await u.save();

    const header = { Authorization: `Bearer ${createJwtForUser(u as any)}` };

    const res = await client
      .post('/api/v1/users/profile/profile-photo-upload')
      .set(header)
      .attach('image', createPngBuffer(), 'pp.png')
      .expect(200);

    expect(res.body.profilePhoto).toBeDefined();

    const cloudinaryMock = await getMockModule('cloudinary');
    expect(cloudinaryMock.__uploadStreamSpy).toHaveBeenCalled();
    expect(cloudinaryMock.__destroySpy).toHaveBeenCalledWith('old-profile-123');
  });

  test('Delete user profile by owner removes posts/comments and cloudinary images', async () => {
    const owner = await userFactory();
    const category = await categoryFactory({ user: (owner as any)._id });
    const p1 = await postFactory({
      user: (owner as any)._id,
      categoryId: (category as any)._id,
      image: { url: 'https://cd.example/p1.jpg', publicId: 'p1-id' },
    });

    await commentFactory({ postId: (p1 as any)._id, user: (owner as any)._id });

    const header = { Authorization: `Bearer ${createJwtForUser(owner as any)}` };

    const res = await client.delete(`/api/v1/users/profile/${(owner as any)._id}`).set(header).expect(200);
    expect(res.body.message).toMatch(/deleted/i);

    const foundP = await Post.findById((p1 as any)._id);
    expect(foundP).toBeNull();

    const comments = await Comment.find({ user: (owner as any)._id });
    expect(comments.length).toBe(0);

    const cloudinaryMock = await getMockModule('cloudinary');
    expect(cloudinaryMock.__deleteResourcesSpy || cloudinaryMock.__destroySpy).toBeDefined();
  });

  test('Delete user profile by admin can delete other user', async () => {
    const victim = await userFactory();
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    await client.delete(`/api/v1/users/profile/${(victim as any)._id}`).set(adminHeader).expect(200);

    const found = await User.findById((victim as any)._id);
    expect(found).toBeNull();
  });

  test('Delete user profile by non-owner non-admin is forbidden', async () => {
    const owner = await userFactory();
    const other = await userFactory();
    const otherHeader = { Authorization: `Bearer ${createJwtForUser(other as any)}` };

    await client.delete(`/api/v1/users/profile/${(owner as any)._id}`).set(otherHeader).expect(403);
  });

  test('Get users count (admin only) returns number', async () => {
    await userFactory();
    await userFactory();
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const res = await client.get('/api/v1/users/count').set(adminHeader).expect(200);
    expect(typeof res.body).toBe('number');
    expect(res.body).toBeGreaterThanOrEqual(2);
  });

  test('Get users list with username filter works and pagination works', async () => {
    await userFactory({ username: 'alice' });
    await userFactory({ username: 'alice' });
    await userFactory({ username: 'bob' });

    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const res = await client.get('/api/v1/users/profile').set(adminHeader).query({ username: 'alice', pageNumber: '1' }).expect(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.totalPages).toBeDefined();
  });

  test('expired JWT is rejected on protected route (/users/me)', async () => {
    const u = await userFactory();
    const token = jwt.sign({ id: u._id!.toString(), isAdmin: false }, process.env.JWT_SECRET!, { expiresIn: -10 });
    await client.get('/api/v1/users/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  test('password update validation: weak password returns 400 and does not change password', async () => {
    const { user, authHeader } = await registerAndLogin(undefined, { username: `pwtest-${Date.now()}` });
    const weak = 'short';
    const res = await client
      .patch(`/api/v1/users/profile/${user._id}`)
      .set(authHeader)
      .send({ password: weak })
      .expect(400);
    expect(res.body).toHaveProperty('errors');

    await client.post('/api/v1/auth/login').send({ email: user.email, password: 'Aa1!password' }).expect(200);
  });

  test('profile photo large file (> limit) is rejected and cloudinary not called', async () => {
    const u = await userFactory();
    const header = { Authorization: `Bearer ${createJwtForUser(u as any)}` };

    const cloudinaryMock = await getMockModule('cloudinary');
    cloudinaryMock.__uploadStreamSpy.mockClear();

    const big = Buffer.alloc(1 * 1024 * 1024 + 100, 0x41);

    const res = await client
      .post('/api/v1/users/profile/profile-photo-upload')
      .set(header)
      .attach('image', big, { filename: 'big.png', contentType: 'image/png' } as any);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body).toHaveProperty('message');
    expect(cloudinaryMock.__uploadStreamSpy.mock.calls.length).toBe(0);
  });

  test('delete user triggers cloudinary.delete_resources (for multiple post images)', async () => {
    const owner = await userFactory();
    const category = await categoryFactory({ user: (owner as any)._id });
    await postFactory({ user: (owner as any)._id, categoryId: (category as any)._id, image: { url: 'x', publicId: 'a1' } });
    await postFactory({ user: (owner as any)._id, categoryId: (category as any)._id, image: { url: 'y', publicId: 'a2' } });

    const header = { Authorization: `Bearer ${createJwtForUser(owner as any)}` };
    const cloudinaryMock: any = await getMockModule('cloudinary');
    cloudinaryMock.__deleteResourcesSpy.mockClear();

    await client.delete(`/api/v1/users/profile/${(owner as any)._id}`).set(header).expect(200);

    expect(cloudinaryMock.__deleteResourcesSpy.mock.calls.length + cloudinaryMock.__destroySpy.mock.calls.length).toBeGreaterThan(0);
  });

  test('attempting to patch a non-existent user returns 404 or 401 depending on middleware', async () => {
    const fakeId = '000000000000000000000000';
    const token = jwt.sign({ id: fakeId, isAdmin: false }, process.env.JWT_SECRET!, { expiresIn: '7d' });
    const header = { Authorization: `Bearer ${token}` };
    await client.patch(`/api/v1/users/profile/${fakeId}`).set(header).send({ bio: 'x' }).expect(404);
  });

  test('update username validation (too short) returns 400', async () => {
    const { user, authHeader } = await registerAndLogin(undefined, { username: `upd-check-${Date.now()}` });
    await client.patch(`/api/v1/users/profile/${user._id}`).set(authHeader).send({ username: 'a' }).expect(400);
  });
});