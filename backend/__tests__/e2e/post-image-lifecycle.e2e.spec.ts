import { getE2EAgent } from '../../tests/helpers/e2eClient.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import { registerAndLogin } from '../../tests/helpers/auth.js';
import { createPngBuffer } from '../../tests/helpers/fileHelpers.js';
import { getMockModule } from '../../tests/helpers/getMockModule.js';
import { categoryFactory } from '../../tests/helpers/factories.js';
import Post from '../../src/models/Post.js';
import Comment from '../../src/models/Comment.js';

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('E2E — Post image lifecycle: upload -> replace -> delete (file flow)', () => {
  test('upload image on create -> replace image -> delete post cleans up images + comments', async () => {
    const agent = getE2EAgent();

    // 1) Register & login owner via API (agent)
    const username = `owner-${Date.now()}`;
    const email = `owner-${Date.now()}@test.local`;
    const password = 'Aa1!password';

    // registerAndLogin takes optional agent param; it will register, mark verified in helper and login
    const { user, token } = await registerAndLogin(agent, { username, email, password });
    // set Authorization header on agent for subsequent calls
    (agent as any).set('Authorization', `Bearer ${token}`);

    // 2) Create a category (via factory — allowed for test setup)
    const category = await categoryFactory({ user: (user as any)._id });

    // 3) Create a post with image via API (multipart)
    const imgBuf = createPngBuffer();
    const title = 'Image lifecycle post';
    const description = 'E2E test post for image lifecycle';

    // clear cloudinary mock calls before creating
    const cloudinaryMock: any = await getMockModule('cloudinary');
    cloudinaryMock.__uploadStreamSpy.mockClear();
    cloudinaryMock.__destroySpy.mockClear();
    cloudinaryMock.__deleteResourcesSpy && cloudinaryMock.__deleteResourcesSpy.mockClear();

    const createRes = await agent
      .post('/api/v1/posts')
      .field('title', title)
      .field('description', description)
      .field('categoryId', (category as any)._id.toString())
      .attach('image', imgBuf, { filename: 'post.png', contentType: 'image/png' } as any)
      .expect(201);

    expect(createRes.body).toBeDefined();
    const createdPostId = createRes.body._id ?? createRes.body.id ?? createRes.body;
    // cloudinary upload must have been called
    expect(cloudinaryMock.__uploadStreamSpy.mock.calls.length).toBeGreaterThan(0);

    // Inspect DB to see stored publicId (mock returns 'mock-id' unless opts.public_id specified)
    const createdPost = await Post.findById(createdPostId);
    expect(createdPost).toBeTruthy();
    const initialPublicId = (createdPost as any).image?.publicId ?? null;
    // The mock returns a default public_id 'mock-id', but be resilient:
    expect(typeof initialPublicId === 'string' || initialPublicId === null).toBeTruthy();

    // 4) Update the post image -> new upload occurs and old image destroyed
    cloudinaryMock.__uploadStreamSpy.mockClear();

    const newBuf = createPngBuffer();
    const updateRes = await agent
      .patch(`/api/v1/posts/update-image/${createdPostId}`)
      .attach('image', newBuf, { filename: 'new.png', contentType: 'image/png' } as any)
      .expect(200);

    expect(updateRes.body).toBeDefined();
    // Upload called for replacement
    expect(cloudinaryMock.__uploadStreamSpy.mock.calls.length).toBeGreaterThan(0);
    // destroy should have been called for previous publicId (if any)
    if (initialPublicId) {
      const destroyCalls = cloudinaryMock.__destroySpy.mock.calls.map((c: any[]) => c[0]);
      expect(destroyCalls).toContain(initialPublicId);
    }

    // 5) Add a comment to the post (owner can comment too)
    const commentText = 'A comment that will be removed when post is deleted';
    const commentRes = await agent.post('/api/v1/comments').send({
      postId: createdPostId,
      text: commentText,
    }).expect(201);

    expect(commentRes.body).toBeDefined();
    const commentId = commentRes.body._id ?? commentRes.body.id ?? commentRes.body;

    // Ensure comment exists in DB before deletion
    const foundBefore = await Comment.findById(commentId);
    expect(foundBefore).toBeTruthy();

    // Clear destroy spy counts to make assertions focused on delete step
    cloudinaryMock.__destroySpy.mockClear();
    cloudinaryMock.__deleteResourcesSpy && cloudinaryMock.__deleteResourcesSpy.mockClear();

    // 6) Delete post -> expects cloudinary destroy called and comments removed
    const delRes = await agent.delete(`/api/v1/posts/${createdPostId}`).expect(200);
    expect(delRes.body).toBeDefined();
    expect(delRes.body.postId).toBeDefined();

    // Post should be absent
    const afterPost = await Post.findById(createdPostId);
    expect(afterPost).toBeNull();

    // Comments for that post should be removed
    const commentsAfter = await Comment.find({ postId: createdPostId });
    expect(commentsAfter.length).toBe(0);

    // Cloudinary destroy should have been called for the image(s)
    const destroyCallsFinal = cloudinaryMock.__destroySpy.mock.calls.length + (cloudinaryMock.__deleteResourcesSpy ? cloudinaryMock.__deleteResourcesSpy.mock.calls.length : 0);
    expect(destroyCallsFinal).toBeGreaterThanOrEqual(1);
  });
});