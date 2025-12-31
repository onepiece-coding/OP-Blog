import request from 'supertest';
import app from '../../src/app.js';
import { registerAndLogin, createJwtForUser } from '../../tests/helpers/auth.js';
import { createPngBuffer } from '../../tests/helpers/fileHelpers.js';
import { postFactory, categoryFactory, commentFactory, userFactory } from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import Post from '../../src/models/Post.js';
import Comment from '../../src/models/Comment.js';
import { getMockModule } from '../../tests/helpers/getMockModule.js';

const client = request(app);

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('Posts integration', () => {
  test('create post with image uploads to cloudinary and returns populated post', async () => {
    const { user, authHeader } = await registerAndLogin(undefined, { username: `poster-${Date.now()}` });

    const category = await categoryFactory({ user: (user as any)._id });

    const res = await client
      .post('/api/v1/posts')
      .set(authHeader)
      .field('title', 'Integration post')
      .field('description', 'This description is long enough for validation.')
      .field('categoryId', (category as any)._id.toString())
      .attach('image', createPngBuffer(), 'tiny.png')
      .expect(201);

    expect(res.body.title).toBe('Integration post');
    expect(res.body.user).toBeDefined();
    expect(res.body.categoryId).toBeDefined();

    const cloudinaryMock = await getMockModule('cloudinary');
    expect(cloudinaryMock.__uploadStreamSpy).toHaveBeenCalled();
  });

  test('get all posts supports search and pagination', async () => {
    const posts = [];
    for (let i = 0; i < 6; i++) {
      const p = await postFactory({ title: i % 2 === 0 ? `searchme ${i}` : `other ${i}` });
      posts.push(p);
    }

    const res = await client.get('/api/v1/posts').query({ text: 'searchme', pageNumber: '1' }).expect(200);
    expect(Array.isArray(res.body.posts)).toBe(true);
    expect(res.body.posts.length).toBeGreaterThan(0);
    expect(res.body.totalPages).toBeGreaterThanOrEqual(1);
    expect(res.body.posts[0].title.toLowerCase()).toContain('searchme');
  });

  test('toggle like toggles on and off', async () => {
    const poster = await userFactory();
    const liker = await userFactory();
    const category = await categoryFactory({ user: (poster as any)._id });
    const post = await postFactory({
      user: (poster as any)._id,
      categoryId: (category as any)._id,
    });

    const token = createJwtForUser(liker as any);
    const authHeader = { Authorization: `Bearer ${token}` };

    const res1 = await client.patch(`/api/v1/posts/like/${(post as any)._id}`).set(authHeader).expect(200);
    expect(res1.body.likes).toEqual(expect.arrayContaining([expect.any(String)]));

    const res2 = await client.patch(`/api/v1/posts/like/${(post as any)._id}`).set(authHeader).expect(200);
    const likedAgain = (res2.body.likes as string[]).find((u) => u === (liker as any)._id.toString());
    expect(likedAgain).toBeUndefined();
  });

  test('delete post by owner removes post, its comments, and calls cloudinary destroy', async () => {
    const owner = await userFactory();
    const category = await categoryFactory({ user: (owner as any)._id });
    const post = await postFactory({
      user: (owner as any)._id,
      categoryId: (category as any)._id,
      image: { url: 'https://example.com/mock.jpg', publicId: 'mock-id-123' },
    });

    await commentFactory({ postId: (post as any)._id, user: (owner as any)._id });

    const ownerToken = createJwtForUser(owner as any);
    const ownerAuthHeader = { Authorization: `Bearer ${ownerToken}` };

    const res = await client.delete(`/api/v1/posts/${(post as any)._id}`).set(ownerAuthHeader).expect(200);
    expect(res.body.postId).toBeDefined();

    const found = await Post.findById((post as any)._id);
    expect(found).toBeNull();

    const comments = await Comment.find({ postId: (post as any)._id });
    expect(comments.length).toBe(0);

    const cloudinaryMock = await getMockModule('cloudinary');
    expect(cloudinaryMock.__destroySpy).toHaveBeenCalledWith('mock-id-123');
  });

  test('delete post by non-owner returns 403', async () => {
    const owner = await userFactory();
    const other = await userFactory();
    const category = await categoryFactory({ user: (owner as any)._id });
    const post = await postFactory({ user: (owner as any)._id, categoryId: (category as any)._id });

    const otherToken = createJwtForUser(other as any);
    const otherAuthHeader = { Authorization: `Bearer ${otherToken}` };

    await client.delete(`/api/v1/posts/${(post as any)._id}`).set(otherAuthHeader).expect(403);
  });

  test('create post with missing category returns 404', async () => {
    const { authHeader } = await registerAndLogin(undefined, { username: `postNoCat-${Date.now()}` });

    const res = await client
      .post('/api/v1/posts')
      .set(authHeader)
      .field('title', 'No category')
      .field('description', 'desc long enough')
      .field('categoryId', '000000000000000000000000')
      .expect(404);

    expect(res.body.message).toMatch(/category not found/i);
  });

  test('update post by owner succeeds and non-owner gets 403', async () => {
    const owner = await userFactory();
    const category = await categoryFactory({ user: (owner as any)._id });
    const post = await postFactory({
      user: (owner as any)._id,
      categoryId: (category as any)._id,
      title: 'Original title',
    });

    const ownerToken = createJwtForUser(owner as any);
    const ownerAuth = { Authorization: `Bearer ${ownerToken}` };

    const updated = await client
      .patch(`/api/v1/posts/${(post as any)._id}`)
      .set(ownerAuth)
      .send({ title: 'Updated title' })
      .expect(200);
    expect(updated.body.title).toBe('Updated title');

    const other = await userFactory();
    const otherToken = createJwtForUser(other as any);
    const otherAuth = { Authorization: `Bearer ${otherToken}` };

    await client
      .patch(`/api/v1/posts/${(post as any)._id}`)
      .set(otherAuth)
      .send({ title: 'Hacked title' })
      .expect(403);
  });

  test('update post image replaces image and calls cloudinary destroy & upload', async () => {
    const owner = await userFactory();
    const category = await categoryFactory({ user: (owner as any)._id });
    const post = await postFactory({
      user: (owner as any)._id,
      categoryId: (category as any)._id,
      image: { url: 'https://example.com/old.jpg', publicId: 'old-public-id' },
    });

    const ownerToken = createJwtForUser(owner as any);
    const ownerAuth = { Authorization: `Bearer ${ownerToken}` };

    const res = await client
      .patch(`/api/v1/posts/update-image/${(post as any)._id}`)
      .set(ownerAuth)
      .attach('image', createPngBuffer(), 'new.png')
      .expect(200);

    expect(res.body.image).toBeDefined();
    const cloudinaryMock = await getMockModule('cloudinary');
    expect(cloudinaryMock.__uploadStreamSpy).toHaveBeenCalled();
    expect(cloudinaryMock.__destroySpy).toHaveBeenCalledWith('old-public-id');
  });

  test('non-image upload is rejected by multer fileFilter', async () => {
    const { authHeader } = await registerAndLogin(undefined, { username: `postBadFile-${Date.now()}` });
    const category = await categoryFactory({ user: ( (await userFactory()) as any )._id });

    const res = await client
      .post('/api/v1/posts')
      .set(authHeader)
      .field('title', 'Bad file')
      .field('description', 'Some long description here')
      .field('categoryId', (category as any)._id.toString())
      .attach('image', Buffer.from('hello'), { filename: 'file.txt', contentType: 'text/plain' } as any);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body).toHaveProperty('message');
  });
});