import request from 'supertest';
import app from '../../src/app.js';
import { createJwtForUser } from '../../tests/helpers/auth.js';
import { userFactory, categoryFactory } from '../../tests/helpers/factories.js';
import { clearDatabase } from '../../tests/helpers/db.js';
import { resetThirdPartyMocks } from '../../tests/helpers/mocks.js';
import Category from '../../src/models/Category.js';
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

describe('Categories integration', () => {
  test('Admin can create a category (POST /api/v1/categories)', async () => {
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const title = `Cat-${Date.now()}`;
    const res = await client
      .post('/api/v1/categories')
      .set(adminHeader)
      .send({ title })
      .expect(201);

    expect(res.body).toBeDefined();
    expect(res.body.title).toBe(title);

    const found = await Category.findOne({ title });
    expect(found).toBeTruthy();
    expect(found!.title).toBe(title);
    expect(found!.user.toString()).toBe(admin._id!.toString());
  });

  test('Non-admin cannot create category (403)', async () => {
    const normal = await userFactory();
    const header = { Authorization: `Bearer ${createJwtForUser(normal as any)}` };

    await client.post('/api/v1/categories').set(header).send({ title: 'Nope' }).expect(403);
  });

  test('Creating duplicate category (case-insensitive) returns 409', async () => {
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const title = `MyCategory-${Date.now()}`;

    await client.post('/api/v1/categories').set(adminHeader).send({ title }).expect(201);

    await client.post('/api/v1/categories').set(adminHeader).send({ title }).expect(409);

    const altCase = title.toUpperCase();
    await client.post('/api/v1/categories').set(adminHeader).send({ title: altCase }).expect(409);
  });

  test('GET /api/v1/categories returns paginated results and supports search', async () => {
    for (let i = 0; i < 12; i++) {
      const t = i % 3 === 0 ? `findme-${i}` : `other-${i}`;
      await categoryFactory({ title: t });
    }

    const resSearch = await client.get('/api/v1/categories').query({ search: 'findme', pageNumber: '1' }).expect(200);
    expect(resSearch.body).toBeDefined();
    expect(Array.isArray(resSearch.body.users) || Array.isArray(resSearch.body)).toBeTruthy();
    const results = resSearch.body.users ?? resSearch.body;
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title.toLowerCase()).toContain('findme');

    const resPage2 = await client.get('/api/v1/categories').query({ pageNumber: '2' }).expect(200);
    expect(resPage2.body).toBeDefined();
    expect(resPage2.body.totalPages).toBeGreaterThanOrEqual(1);
  });

  test('Admin can delete category (DELETE /api/v1/categories/:id) and non-admin cannot', async () => {
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const normal = await userFactory();
    const normalHeader = { Authorization: `Bearer ${createJwtForUser(normal as any)}` };

    const cat = await categoryFactory({ title: `todel-${Date.now()}` });

    await client.delete(`/api/v1/categories/${(cat as any)._id}`).set(normalHeader).expect(403);

    const res = await client.delete(`/api/v1/categories/${(cat as any)._id}`).set(adminHeader).expect(200);
    expect(res.body).toBeDefined();
    expect(res.body.categoryId).toBeDefined();

    const after = await Category.findById((cat as any)._id);
    expect(after).toBeNull();
  });

  test('Deleting non-existing category returns 404', async () => {
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const fakeId = new mongoose.Types.ObjectId();
    await client.delete(`/api/v1/categories/${fakeId}`).set(adminHeader).expect(404);
  });

  test('Malformed category id in route returns 400 (validateObjectIdParam)', async () => {
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    await client.delete('/api/v1/categories/not-a-valid-id').set(adminHeader).expect(400);
  });

  test('GET /api/v1/categories with empty search returns all (paginated)', async () => {
    await categoryFactory({ title: `alpha-${Date.now()}` });
    await categoryFactory({ title: `beta-${Date.now()}` });

    const res = await client.get('/api/v1/categories').expect(200);
    expect(res.body).toBeDefined();
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.totalPages).toBeDefined();
  });

  test('Validation: creating category without title returns 400', async () => {
    const admin = await userFactory({ isAdmin: true });
    const adminHeader = { Authorization: `Bearer ${createJwtForUser(admin as any)}` };

    const res = await client.post('/api/v1/categories').set(adminHeader).send({ title: '' }).expect(400);
    expect(res.body).toHaveProperty('errors');
  });
});