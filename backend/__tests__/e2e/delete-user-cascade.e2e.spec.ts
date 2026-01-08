import { getE2EAgent } from '../../tests/helpers/e2eClient.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import { registerAndLogin } from '../../tests/helpers/auth.js';
import { postFactory, commentFactory } from '../../tests/helpers/factories.js';
import { getMockModule } from '../../tests/helpers/getMockModule.js';
import User from '../../src/models/User.js';
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

describe('E2E — Delete user profile cascade + cloudinary.delete_resources', () => {
  test('owner deletes account -> user, posts, comments removed and cloudinary delete called', async () => {
    const agent = getE2EAgent();

    // 1) Register & login owner (via API). Helper marks account verified and returns token/header.
    const username = `deleter-${Date.now()}`;
    const email = `deleter-${Date.now()}@test.local`;
    const password = 'Aa1!password';
    const { user, token, authHeader } = await registerAndLogin(agent, {
      username,
      email,
      password,
    });

    // ensure agent uses Authorization header
    (agent as any).set('Authorization', `Bearer ${token}`);

    // 2) Create several posts owned by this user (each with image.publicId set)
    const p1 = await postFactory({
      user: (user as any)._id,
      image: { url: 'https://example.com/p1.jpg', publicId: 'p1-public-111' },
    });
    const p2 = await postFactory({
      user: (user as any)._id,
      image: { url: 'https://example.com/p2.jpg', publicId: 'p2-public-222' },
    });
    const p3 = await postFactory({
      user: (user as any)._id,
      image: { url: 'https://example.com/p3.jpg', publicId: 'p3-public-333' },
    });

    // 3) Create comments tied to posts (and the user)
    await commentFactory({ postId: (p1 as any)._id, user: (user as any)._id, text: 'c1' });
    await commentFactory({ postId: (p2 as any)._id, user: (user as any)._id, text: 'c2' });
    await commentFactory({ postId: (p3 as any)._id, user: (user as any)._id, text: 'c3' });

    // sanity: ensure records exist
    const beforeUser = await User.findById((user as any)._id);
    expect(beforeUser).toBeTruthy();
    const beforePosts = await Post.find({ user: (user as any)._id });
    expect(beforePosts.length).toBeGreaterThanOrEqual(3);
    const beforeComments = await Comment.find({ user: (user as any)._id });
    expect(beforeComments.length).toBeGreaterThanOrEqual(3);

    // Clear cloudinary mock call counters and get mock
    const cloudinaryMock: any = await getMockModule('cloudinary');
    cloudinaryMock.__deleteResourcesSpy && cloudinaryMock.__deleteResourcesSpy.mockClear();
    cloudinaryMock.__destroySpy && cloudinaryMock.__destroySpy.mockClear();

    // 4) Delete user profile via API as owner
    const res = await agent.delete(`/api/v1/users/profile/${(user as any)._id}`).set(authHeader).expect(200);
    expect(res.body).toBeDefined();
    expect(res.body.message).toMatch(/deleted|deleted successfully|deleted/i);

    // 5) Assert user removed
    const afterUser = await User.findById((user as any)._id);
    expect(afterUser).toBeNull();

    // 6) Assert posts removed
    const postsAfter = await Post.find({ user: (user as any)._id });
    expect(postsAfter.length).toBe(0);

    // 7) Assert comments removed
    const commentsAfter = await Comment.find({ user: (user as any)._id });
    expect(commentsAfter.length).toBe(0);

    // 8) Assert cloudinary delete was invoked (either delete_resources or destroy)
    const deleteResourcesCalls = cloudinaryMock.__deleteResourcesSpy ? cloudinaryMock.__deleteResourcesSpy.mock.calls.length : 0;
    const destroyCalls = cloudinaryMock.__destroySpy ? cloudinaryMock.__destroySpy.mock.calls.length : 0;

    // At least one of these should have been called
    expect(deleteResourcesCalls + destroyCalls).toBeGreaterThanOrEqual(1);

    // If delete_resources was called, assert it received the publicIds we created
    if (cloudinaryMock.__deleteResourcesSpy && cloudinaryMock.__deleteResourcesSpy.mock.calls.length > 0) {
      const firstArg = cloudinaryMock.__deleteResourcesSpy.mock.calls[0][0] as string[];
      // Should contain our publicIds
      expect(firstArg).toEqual(expect.arrayContaining(['p1-public-111', 'p2-public-222', 'p3-public-333']));
    } else if (cloudinaryMock.__destroySpy && cloudinaryMock.__destroySpy.mock.calls.length > 0) {
      // If destroy was used (called per-image), ensure one of the calls included a known publicId
      const calledIds = cloudinaryMock.__destroySpy.mock.calls.map((c: any[]) => c[0]);
      expect(calledIds).toEqual(expect.arrayContaining(['p1-public-111', 'p2-public-222', 'p3-public-333'].filter(Boolean)));
    }
  });
});