import request from 'supertest';
import stream from 'stream';
import app from '../../src/app.js';
import { createJwtForUser, registerAndLogin } from '../../tests/helpers/auth.js';
import {
  userFactory,
  categoryFactory,
  postFactory,
  commentFactory,
} from '../../tests/helpers/factories.js';
import { createPngBuffer } from '../../tests/helpers/fileHelpers.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import { getMockModule } from '../../tests/helpers/getMockModule.js';
import Post from '../../src/models/Post.js';
import Comment from '../../src/models/Comment.js';
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

describe('Cloudinary failure handling (integration)', () => {
  test('create post with image: upload_stream failure -> 500 and no DB post created', async () => {
    const { user, authHeader } = await registerAndLogin(undefined, { username: `u-${Date.now()}` });
    const category = await categoryFactory({ user: (user as any)._id });

    const cloudinaryMock: any = await getMockModule('cloudinary');
    cloudinaryMock.__uploadStreamSpy.mockImplementationOnce((opts: any, cb: any) => {
      const p = new stream.PassThrough();
      p.on('finish', () => cb(new Error('simulated upload error')));
      return p;
    });

    const res = await client
      .post('/api/v1/posts')
      .set(authHeader)
      .field('title', 'bad-upload-post')
      .field('description', 'This description is long enough for validation.')
      .field('categoryId', (category as any)._id.toString())
      .attach('image', createPngBuffer(), { filename: 'img.png', contentType: 'image/png' } as any);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body).toHaveProperty('message');

    expect(cloudinaryMock.__uploadStreamSpy.mock.calls.length).toBeGreaterThan(0);

    const found = await Post.findOne({ title: 'bad-upload-post' });
    expect(found).toBeNull();
  });

  test('update post image: upload_stream failure -> 500 and post.image unchanged', async () => {
    const owner = await userFactory();
    const category = await categoryFactory({ user: (owner as any)._id });
    const post = await postFactory({
      user: (owner as any)._id,
      categoryId: (category as any)._id,
      image: { url: 'https://example.com/old.jpg', publicId: 'old-public-123' },
    });

    const token = createJwtForUser(owner as any);
    const authHeader = { Authorization: `Bearer ${token}` };

    const cloudinaryMock: any = await getMockModule('cloudinary');
    cloudinaryMock.__uploadStreamSpy.mockImplementationOnce((opts: any, cb: any) => {
      const p = new stream.PassThrough();
      p.on('finish', () => cb(new Error('simulated upload error on update')));
      return p;
    });

    const res = await client
      .patch(`/api/v1/posts/update-image/${(post as any)._id}`)
      .set(authHeader)
      .attach('image', createPngBuffer(), { filename: 'new.png', contentType: 'image/png' } as any);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body).toHaveProperty('message');

    const fresh = await Post.findById((post as any)._id);
    expect(fresh).toBeTruthy();
    expect(fresh!.image.publicId).toBe('old-public-123');
  });

  test('delete post: cloudinary destroy throws -> 500 and post/comments remain', async () => {
    const owner = await userFactory();
    const category = await categoryFactory({ user: (owner as any)._id });
    const post = await postFactory({
      user: (owner as any)._id,
      categoryId: (category as any)._id,
      image: { url: 'https://example.com/x.jpg', publicId: 'to-destroy-999' },
    });

    await commentFactory({ postId: (post as any)._id, user: (owner as any)._id, text: 'c' });

    const token = createJwtForUser(owner as any);
    const authHeader = { Authorization: `Bearer ${token}` };

    const cloudinaryMock: any = await getMockModule('cloudinary');
    cloudinaryMock.__destroySpy.mockImplementationOnce(async (_publicId: string) => {
      throw new Error('simulated destroy failure');
    });

    const res = await client.delete(`/api/v1/posts/${(post as any)._id}`).set(authHeader);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body).toHaveProperty('message');

    const pAfter = await Post.findById((post as any)._id);
    expect(pAfter).toBeTruthy();

    const comments = await Comment.find({ postId: (post as any)._id });
    expect(comments.length).toBeGreaterThan(0);
  });

  test('delete user profile: delete_resources throws -> 500 and user & posts remain', async () => {
    const owner = await userFactory();
    const category = await categoryFactory({ user: (owner as any)._id });
    const p1 = await postFactory({
      user: (owner as any)._id,
      categoryId: (category as any)._id,
      image: { url: 'https://example.com/p1.jpg', publicId: 'p1-id-111' },
    });
    const p2 = await postFactory({
      user: (owner as any)._id,
      categoryId: (category as any)._id,
      image: { url: 'https://example.com/p2.jpg', publicId: 'p2-id-222' },
    });

    await commentFactory({ postId: (p1 as any)._id, user: (owner as any)._id });

    const token = createJwtForUser(owner as any);
    const authHeader = { Authorization: `Bearer ${token}` };

    const cloudinaryMock: any = await getMockModule('cloudinary');
    cloudinaryMock.__deleteResourcesSpy.mockImplementationOnce(async (_ids: string[]) => {
      throw new Error('simulated delete_resources failure');
    });

    const res = await client.delete(`/api/v1/users/profile/${(owner as any)._id}`).set(authHeader);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body).toHaveProperty('message');

    const uAfter = await User.findById((owner as any)._id);
    expect(uAfter).toBeTruthy();

    const foundP1 = await Post.findById((p1 as any)._id);
    const foundP2 = await Post.findById((p2 as any)._id);
    expect(foundP1).toBeTruthy();
    expect(foundP2).toBeTruthy();

    const comments = await Comment.find({ user: (owner as any)._id });
    expect(comments.length).toBeGreaterThan(0);
  });
});