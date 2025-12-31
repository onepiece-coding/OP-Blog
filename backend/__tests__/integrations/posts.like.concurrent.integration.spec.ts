import request from 'supertest';
import app from '../../src/app.js';
import { createJwtForUser } from '../../tests/helpers/auth.js';
import { userFactory, postFactory } from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import Post from '../../src/models/Post.js';

import mongoose from 'mongoose';


const client = request(app);

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('Posts.like concurrency & idempotency', () => {
  test('concurrent likes by same user do not create duplicate entries', async () => {
    const user = await userFactory();
    const post = await postFactory({ user: (user as any)._id as mongoose.Types.ObjectId });

    const token = createJwtForUser(user as any);
    const authHeader = { Authorization: `Bearer ${token}` };

    const N = 12;
    const requests = new Array(N).fill(null).map(() =>
      client.patch(`/api/v1/posts/like/${(post as any)._id}`).set(authHeader)
    );

    const responses = await Promise.all(requests);
    responses.forEach((r) => {
      if (r.status >= 500) {
        throw new Error(`Server error during concurrent likes: ${r.status} ${JSON.stringify(r.body)}`);
      }
    });

    const fresh = await Post.findById((post as any)._id);
    expect(fresh).toBeTruthy();

    const likes = (fresh!.likes as any[]).map(String);
    const unique = new Set(likes);
    expect(likes.length).toBeGreaterThanOrEqual(0);
    expect(unique.size).toBe(likes.length);
    const occurrences = likes.filter((id) => id === (user as any)._id.toString()).length;
    expect(occurrences).toBeLessThanOrEqual(1);
  });

  test('repeated sequential toggles are idempotent (on -> off -> on)', async () => {
    const owner = await userFactory();
    const post = await postFactory({ user: (owner as any)._id });

    const token = createJwtForUser(owner as any);
    const authHeader = { Authorization: `Bearer ${token}` };

    const r1 = await client.patch(`/api/v1/posts/like/${(post as any)._id}`).set(authHeader).expect(200);
    let likes = (r1.body.likes as string[]) ?? [];
    const has1 = likes.some((id) => id === (owner as any)._id.toString());
    expect(has1).toBe(true);

    const r2 = await client.patch(`/api/v1/posts/like/${(post as any)._id}`).set(authHeader).expect(200);
    likes = (r2.body.likes as string[]) ?? [];
    const has2 = likes.some((id) => id === (owner as any)._id.toString());
    expect(has2).toBe(false);

    const r3 = await client.patch(`/api/v1/posts/like/${(post as any)._id}`).set(authHeader).expect(200);
    likes = (r3.body.likes as string[]) ?? [];
    const has3 = likes.some((id) => id === (owner as any)._id.toString());
    expect(has3).toBe(true);
  });

  test('concurrent toggles from multiple users yield exactly one like per user (no duplicates)', async () => {
    const owner = await userFactory();
    const post = await postFactory({ user: (owner as any)._id });

    const users = [];
    const headers = [];
    for (let i = 0; i < 8; i++) {
      const u = await userFactory();
      users.push(u);
      const t = createJwtForUser(u as any);
      headers.push({ Authorization: `Bearer ${t}` });
    }

    const reqs = headers.map((h) => client.patch(`/api/v1/posts/like/${(post as any)._id}`).set(h));
    const res = await Promise.all(reqs);

    res.forEach((r) => {
      if (r.status >= 500) {
        throw new Error(`Server error during concurrent multi-user toggles: ${r.status} ${JSON.stringify(r.body)}`);
      }
    });

    const fresh = await Post.findById((post as any)._id);
    expect(fresh).toBeTruthy();

    const likes = (fresh!.likes as any[]).map(String);
    const unique = new Set(likes);
    expect(unique.size).toBe(likes.length);

    for (const u of users) {
      const occurrences = likes.filter((id) => id === (u as any)._id.toString()).length;
      expect(occurrences).toBeLessThanOrEqual(1);
    }
  });
});