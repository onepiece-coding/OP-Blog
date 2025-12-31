import request from 'supertest';
import app from '../../src/app.js';
import {
  createJwtForUser,
} from '../../tests/helpers/auth.js';
import {
  userFactory,
  postFactory,
  commentFactory,
} from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
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

describe('Comments integration', () => {
  test('Create comment (POST /api/v1/comments) — success', async () => {
    const author = await userFactory();
    const post = await postFactory({ user: (author as any)._id });

    const token = createJwtForUser(author as any);
    const authHeader = { Authorization: `Bearer ${token}` };

    const res = await client
      .post('/api/v1/comments')
      .set(authHeader)
      .send({ postId: (post as any)._id.toString(), text: 'Nice post!' })
      .expect(201);

    expect(res.body).toBeDefined();
    expect(res.body.text).toBe('Nice post!');
    expect(res.body.postId.toString()).toBe((post as any)._id.toString());
    expect(res.body.username).toBeDefined();

    const found = await Comment.findById(res.body._id);
    expect(found).toBeTruthy();
  });

  test('Create comment fails when post does not exist -> 404', async () => {
    const u = await userFactory();
    const authHeader = { Authorization: `Bearer ${createJwtForUser(u as any)}` };

    const fakePostId = '000000000000000000000000';
    const res = await client
      .post('/api/v1/comments')
      .set(authHeader)
      .send({ postId: fakePostId, text: 'Will fail' })
      .expect(404);

    expect(res.body.message).toMatch(/post not found/i);
  });

  test('Create comment validation: invalid postId format -> 400', async () => {
    const u = await userFactory();
    const authHeader = { Authorization: `Bearer ${createJwtForUser(u as any)}` };

    const res = await client
      .post('/api/v1/comments')
      .set(authHeader)
      .send({ postId: 'not-an-objectid', text: 'x' })
      .expect(400);

    expect(res.body).toHaveProperty('errors');
  });

  test('Get all comments (GET /api/v1/comments) — admin only, populated user', async () => {
    const u1 = await userFactory();
    const post = await postFactory({ user: (u1 as any)._id });
    await commentFactory({ postId: (post as any)._id, user: (u1 as any)._id, text: 'c1' });
    await commentFactory({ postId: (post as any)._id, user: (u1 as any)._id, text: 'c2' });

    const nonAdminHeader = { Authorization: `Bearer ${createJwtForUser((await userFactory()) as any)}` };
    await client.get('/api/v1/comments').set(nonAdminHeader).expect(403);

    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const res = await client.get('/api/v1/comments').set(adminHeader).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    const first = res.body[0];
    expect(first.user).toBeDefined();
    expect(first.user.username).toBeDefined();
  });

  test('Update comment by owner succeeds; non-owner update returns 404 (per controller)', async () => {
    const owner = await userFactory();
    const post = await postFactory({ user: (owner as any)._id });
    const comment = await commentFactory({ postId: (post as any)._id, user: (owner as any)._id });

    const ownerHeader = { Authorization: `Bearer ${createJwtForUser(owner as any)}` };

    const newText = 'Updated comment text';
    const updated = await client
      .patch(`/api/v1/comments/${(comment as any)._id}`)
      .set(ownerHeader)
      .send({ text: newText })
      .expect(201);

    expect(updated.body).toBeDefined();
    expect(updated.body.text).toBe(newText);

    const other = await userFactory();
    const otherHeader = { Authorization: `Bearer ${createJwtForUser(other as any)}` };

    await client
      .patch(`/api/v1/comments/${(comment as any)._id}`)
      .set(otherHeader)
      .send({ text: 'Hacked' })
      .expect(404);
  });

  test('Delete comment: owner and admin allowed; other user forbidden', async () => {
    const owner = await userFactory();
    const post = await postFactory({ user: (owner as any)._id });
    const comment = await commentFactory({ postId: (post as any)._id, user: (owner as any)._id });

    const other = await userFactory();
    const otherHeader = { Authorization: `Bearer ${createJwtForUser(other as any)}` };
    await client.delete(`/api/v1/comments/${(comment as any)._id}`).set(otherHeader).expect(403);

    const ownerHeader = { Authorization: `Bearer ${createJwtForUser(owner as any)}` };
    await client.delete(`/api/v1/comments/${(comment as any)._id}`).set(ownerHeader).expect(200);

    const comment2 = await commentFactory({ postId: (post as any)._id, user: (owner as any)._id });

    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };
    await client.delete(`/api/v1/comments/${(comment2 as any)._id}`).set(adminHeader).expect(200);
  });

  test('Delete non-existing comment returns 404', async () => {
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const fakeId = '000000000000000000000000';
    await client.delete(`/api/v1/comments/${fakeId}`).set(adminHeader).expect(404);
  });

  test('Malformed comment id in route returns 400 (validateObjectIdParam)', async () => {
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    await client.delete('/api/v1/comments/not-a-valid-id').set(adminHeader).expect(400);
    await client.patch('/api/v1/comments/not-a-valid-id').set(adminHeader).send({ text: 'x' }).expect(400);
  });

  test('creating a comment with empty text returns validation error 400', async () => {
    const author = await userFactory();
    const post = await postFactory({ user: (author as any)._id });
    const header = { Authorization: `Bearer ${createJwtForUser(author as any)}` };

    const res = await client.post('/api/v1/comments').set(header).send({ postId: (post as any)._id.toString(), text: '' }).expect(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('updating a non-existing comment returns 404', async () => {
    const u = await userFactory();
    const header = { Authorization: `Bearer ${createJwtForUser(u as any)}` };
    const fake = '000000000000000000000000';
    await client.patch(`/api/v1/comments/${fake}`).set(header).send({ text: 'x' }).expect(404);
  });

  test('deleting a non-existing comment returns 404 (admin)', async () => {
    const admin = await userFactory({ isAdmin: true });
    const header = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };
    const fake = '000000000000000000000000';
    await client.delete(`/api/v1/comments/${fake}`).set(header).expect(404);
  });

  test('concurrent creates on same post do not conflict (sanity)', async () => {
    const author = await userFactory();
    const post = await postFactory({ user: (author as any)._id });
    const header = { Authorization: `Bearer ${createJwtForUser(author as any)}` };

    const CONC = 6;
    const promises = [];
    for (let i = 0; i < CONC; i++) {
      promises.push(
        client.post('/api/v1/comments').set(header).send({ postId: (post as any)._id.toString(), text: `c-${i}` }),
      );
    }
    const responses = await Promise.all(promises);
    for (const r of responses) {
      expect([201, 400, 409]).toContain(r.status);
    }

    const count = await Comment.countDocuments({ postId: (post as any)._id });
    expect(count).toBeGreaterThanOrEqual(1);
  });
});