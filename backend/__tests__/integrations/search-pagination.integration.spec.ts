import request from 'supertest';
import app from '../../src/app.js';
import {
  postFactory,
  categoryFactory,
} from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';

const client = request(app);

beforeEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

afterEach(async () => {
  await clearDatabase();
  resetThirdPartyMocks();
});

describe('Search & pagination boundaries — posts', () => {
  test('Empty search returns paginated list and correct totalPages', async () => {
    const TOTAL = 9;
    for (let i = 0; i < TOTAL; i++) {
      await postFactory({ title: `pg-post-${i}` });
    }

    const res = await client.get('/api/v1/posts').query({ text: '', pageNumber: '1' }).expect(200);
    expect(res.body).toBeDefined();
    expect(Array.isArray(res.body.posts)).toBe(true);
    expect(res.body.posts.length).toBeGreaterThan(0);
    expect(res.body.posts.length).toBeLessThanOrEqual(4);
    expect(res.body.totalPages).toBe(Math.ceil(TOTAL / 4));
  });

  test('pageNumber beyond last returns empty posts array and correct totalPages', async () => {
    const TOTAL = 5;
    for (let i = 0; i < TOTAL; i++) {
      await postFactory({ title: `beyond-${i}` });
    }

    const res = await client.get('/api/v1/posts').query({ pageNumber: '100' }).expect(200);
    expect(res.body).toBeDefined();
    expect(Array.isArray(res.body.posts)).toBe(true);
    expect(res.body.posts.length).toBe(0);
    expect(res.body.totalPages).toBe(Math.ceil(TOTAL / 4));
  });

  test('search with emojis, special chars and very long strings returns 200 and safe output', async () => {
    await postFactory({ title: 'emoji 🚀 launch' });
    await postFactory({ title: 'special !@#$%^&*()[]{}<>?' });
    await postFactory({ title: '<script>alert("x")</script> raw-tags' });

    const r1 = await client.get('/api/v1/posts').query({ text: '🚀', pageNumber: '1' }).expect(200);
    expect(Array.isArray(r1.body.posts)).toBe(true);
    const titles = r1.body.posts.map((p: any) => String(p.title).toLowerCase());
    expect(titles.some((t: string) => t.includes('🚀') || t.includes('launch'))).toBeTruthy();

    const r2 = await client.get('/api/v1/posts').query({ text: '!@#$%^&*()[]{}<>?', pageNumber: '1' }).expect(200);
    expect(Array.isArray(r2.body.posts)).toBe(true);

    const long = 'x'.repeat(5000);
    const r3 = await client.get('/api/v1/posts').query({ text: long, pageNumber: '1' }).expect(200);
    expect(Array.isArray(r3.body.posts)).toBe(true);

    const r4 = await client.get('/api/v1/posts').query({ text: '<script>alert(1)</script>', pageNumber: '1' }).expect(200);
    expect(Array.isArray(r4.body.posts)).toBe(true);
  });
});

describe('Search & pagination boundaries — categories', () => {
  test('Empty search returns paginated categories and correct totalPages', async () => {
    const TOTAL = 12;
    for (let i = 0; i < TOTAL; i++) {
      await categoryFactory({ title: `cat-${i}` });
    }

    const res = await client.get('/api/v1/categories').query({ search: '', pageNumber: '1' }).expect(200);
    expect(res.body).toBeDefined();
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThan(0);
    expect(res.body.users.length).toBeLessThanOrEqual(10);
    expect(res.body.totalPages).toBe(Math.ceil(TOTAL / 10));
  });

  test('pageNumber beyond last returns empty array and correct totalPages for categories', async () => {
    const TOTAL = 3;
    for (let i = 0; i < TOTAL; i++) {
      await categoryFactory({ title: `small-${i}` });
    }

    const res = await client.get('/api/v1/categories').query({ pageNumber: '50' }).expect(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBe(0);
    expect(res.body.totalPages).toBe(Math.ceil(TOTAL / 10));
  });

  test('search with special chars / emojis / very long strings on categories returns 200', async () => {
    await categoryFactory({ title: 'funny-emoji-😀' });
    await categoryFactory({ title: 'weird / chars * (test)' });
    await categoryFactory({ title: '<b>bold-cat</b>' });

    const r1 = await client.get('/api/v1/categories').query({ search: '😀', pageNumber: '1' }).expect(200);
    expect(Array.isArray(r1.body.users)).toBe(true);

    const r2 = await client.get('/api/v1/categories').query({ search: '/ chars * (test)', pageNumber: '1' }).expect(200);
    expect(Array.isArray(r2.body.users)).toBe(true);

    const big = 'y'.repeat(8000);
    const r3 = await client.get('/api/v1/categories').query({ search: big, pageNumber: '1' }).expect(200);
    expect(Array.isArray(r3.body.users)).toBe(true);
  });
});