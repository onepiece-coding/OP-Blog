import request from 'supertest';
import app from '../../src/app.js';
import { registerAndLogin } from '../../tests/helpers/auth.js';
import { createPngBuffer } from '../../tests/helpers/fileHelpers.js';
import {
  userFactory,
  categoryFactory,
  postFactory,
} from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import Post from '../../src/models/Post.js';
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

describe('Upload size limits & multer behavior', () => {
  const ONE_MB = 1 * 1024 * 1024;

  const makeFixedBuffer = (size: number) => Buffer.alloc(size, 0x41);

  test('POST /api/v1/posts: upload <1MB succeeds and cloudinary is called', async () => {
    const { user, authHeader } = await registerAndLogin(undefined, { username: `u-${Date.now()}` });
    const category = await categoryFactory({ user: (user as any)._id });

    const small = createPngBuffer();

    const res = await client
      .post('/api/v1/posts')
      .set(authHeader)
      .field('title', 'small-image-post')
      .field('description', 'This description is long enough for validation.')
      .field('categoryId', (category as any)._id.toString())
      .attach('image', small, { filename: 'tiny.png', contentType: 'image/png' } as any)
      .expect(201);

    expect(res.body.title).toBe('small-image-post');

    const found = await Post.findById(res.body._id ?? res.body.id ?? res.body);
    expect(found).toBeTruthy();

    const cloudinaryMock = await getMockModule('cloudinary');
    expect(cloudinaryMock.__uploadStreamSpy).toHaveBeenCalled();
  });

  test('POST /api/v1/posts: upload = 1MB boundary -> accept OR reject but side-effects must be correct', async () => {
    const { user, authHeader } = await registerAndLogin(undefined, { username: `u2-${Date.now()}` });
    const category = await categoryFactory({ user: (user as any)._id });

    const bufEq = makeFixedBuffer(ONE_MB);

    const cloudinaryMock = await getMockModule('cloudinary');
    cloudinaryMock.__uploadStreamSpy.mockClear();
    cloudinaryMock.__destroySpy.mockClear();

    const res = await client
      .post('/api/v1/posts')
      .set(authHeader)
      .field('title', 'eq-1mb-post')
      .field('description', 'Desc long enough.')
      .field('categoryId', (category as any)._id.toString())
      .attach('image', bufEq, { filename: 'one.png', contentType: 'image/png' } as any);

    if (res.status === 201) {
      expect(res.body.title).toBe('eq-1mb-post');
      expect(cloudinaryMock.__uploadStreamSpy.mock.calls.length).toBeGreaterThan(0);
      const found = await Post.findOne({ title: 'eq-1mb-post' });
      expect(found).toBeTruthy();
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body).toHaveProperty('message');
      expect(cloudinaryMock.__uploadStreamSpy.mock.calls.length).toBe(0);
      const found = await Post.findOne({ title: 'eq-1mb-post' });
      expect(found).toBeNull();
    }
  });

  test('POST /api/v1/posts: upload >1MB is rejected and cloudinary not called (no DB post)', async () => {
    const { user, authHeader } = await registerAndLogin(undefined, { username: `u3-${Date.now()}` });
    const category = await categoryFactory({ user: (user as any)._id });

    const bigBuf = makeFixedBuffer(ONE_MB + 10);

    const cloudinaryMock = await getMockModule('cloudinary');
    cloudinaryMock.__uploadStreamSpy.mockClear();
    cloudinaryMock.__destroySpy.mockClear();

    const res = await client
      .post('/api/v1/posts')
      .set(authHeader)
      .field('title', 'big-post')
      .field('description', 'desc long enough')
      .field('categoryId', (category as any)._id.toString())
      .attach('image', bigBuf, { filename: 'big.png', contentType: 'image/png' } as any);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body).toHaveProperty('message');

    expect(cloudinaryMock.__uploadStreamSpy.mock.calls.length).toBe(0);

    const found = await Post.findOne({ title: 'big-post' });
    expect(found).toBeNull();
  });

  test('PATCH /api/v1/posts/update-image/:id - replacement: <1MB ok, >1MB rejected & no cloudinary', async () => {
    const owner = await userFactory();
    const category = await categoryFactory({ user: (owner as any)._id });
    const post = await postFactory({
      user: (owner as any)._id,
      categoryId: (category as any)._id,
      image: { url: 'https://example.com/old.jpg', publicId: 'old-id-123' },
    });

    const ownerToken = (await import('../../tests/helpers/auth.js')).createJwtForUser(owner as any);
    const ownerAuth = { Authorization: `Bearer ${ownerToken}` };

    const cloudinaryMock = await getMockModule('cloudinary');
    cloudinaryMock.__uploadStreamSpy.mockClear();
    cloudinaryMock.__destroySpy.mockClear();

    const small = createPngBuffer();
    const ok = await client
      .patch(`/api/v1/posts/update-image/${(post as any)._id}`)
      .set(ownerAuth)
      .attach('image', small, { filename: 'small.png', contentType: 'image/png' } as any)
      .expect(200);

    expect(ok.body.image).toBeDefined();
    expect(cloudinaryMock.__uploadStreamSpy.mock.calls.length).toBeGreaterThan(0);
    expect(cloudinaryMock.__destroySpy.mock.calls.length).toBeGreaterThanOrEqual(1);

    cloudinaryMock.__uploadStreamSpy.mockClear();
    cloudinaryMock.__destroySpy.mockClear();

    const bigBuf = makeFixedBuffer(ONE_MB + 50);
    const bigRes = await client
      .patch(`/api/v1/posts/update-image/${(post as any)._id}`)
      .set(ownerAuth)
      .attach('image', bigBuf, { filename: 'too-big.png', contentType: 'image/png' } as any);

    expect(bigRes.status).toBeGreaterThanOrEqual(400);
    expect(bigRes.body).toHaveProperty('message');

    expect(cloudinaryMock.__uploadStreamSpy.mock.calls.length).toBe(0);
    expect(cloudinaryMock.__destroySpy.mock.calls.length).toBe(0);
  });

  test('POST /api/v1/users/profile/profile-photo-upload - >1MB rejected and no cloudinary call', async () => {
    const u = await userFactory();
    const header = { Authorization: `Bearer ${(await import('../../tests/helpers/auth.js')).createJwtForUser(u as any)}` };

    const cloudinaryMock = await getMockModule('cloudinary');
    cloudinaryMock.__uploadStreamSpy.mockClear();
    cloudinaryMock.__destroySpy.mockClear();

    const small = createPngBuffer();
    const ok = await client
      .post('/api/v1/users/profile/profile-photo-upload')
      .set(header)
      .attach('image', small, { filename: 'pp.png', contentType: 'image/png' } as any)
      .expect(200);

    expect(ok.body.profilePhoto).toBeDefined();
    expect(cloudinaryMock.__uploadStreamSpy.mock.calls.length).toBeGreaterThan(0);

    cloudinaryMock.__uploadStreamSpy.mockClear();
    cloudinaryMock.__destroySpy.mockClear();

    const bigBuf = makeFixedBuffer(ONE_MB + 80);
    const fail = await client
      .post('/api/v1/users/profile/profile-photo-upload')
      .set(header)
      .attach('image', bigBuf, { filename: 'bigpp.png', contentType: 'image/png' } as any);

    expect(fail.status).toBeGreaterThanOrEqual(400);
    expect(fail.body).toHaveProperty('message');

    expect(cloudinaryMock.__uploadStreamSpy.mock.calls.length).toBe(0);
  });
});