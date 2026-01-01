import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';

describe('validate middleware — mixed inputs (params + body + query)', () => {
  let app: express.Express;
  let server: request.SuperTest<request.Test>;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const validateMod = await import('../../src/middlewares/validate.js');
    const validate = (validateMod.validate ?? validateMod.default) as any;

    const errMod = await import('../../src/middlewares/error.js');
    const errorHandler = errMod.errorHandler as any;

    const schema = {
      params: z.object({ id: z.string().length(24) }),
      query: z.object({ page: z.coerce.number().int().min(1) }).partial(),
      body: z.object({ title: z.string().min(3), count: z.coerce.number().int().min(1) }),
    };

    app.post('/__test/validate/:id', validate(schema as any), (req: any, res) => {
      res.json({
        paramId: req.params?.id,
        queryPageValue: req.query?.page,
        bodyCountValue: req.body?.count,
        bodyTitle: req.body?.title,
      });
    });

    app.use(errorHandler);

    server = request(app) as unknown as request.SuperTest<request.Test>;
  });

  test('multiple invalid parts (params + body + query) -> 400 with errors', async () => {
    const badId = 'not-a-valid-id';
    const res = await server
      .post(`/__test/validate/${badId}`)
      .query({ page: '0' })
      .send({ title: 'ab', count: '0' })
      .expect(400);

    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors).toHaveProperty('params');
    expect(res.body.errors).toHaveProperty('body');
    expect(res.body.errors).toHaveProperty('query');
  });

  test('valid inputs -> 200 and parsed values stored back on req (numbers coerced)', async () => {
    const goodId = new mongoose.Types.ObjectId().toString();
    const payload = { title: 'valid title', count: '2' };
    const query = { page: '3' };

    const res = await server
      .post(`/__test/validate/${goodId}`)
      .query(query)
      .send(payload)
      .expect(200);

    expect(Number(res.body.bodyCountValue)).toBe(2);
    expect(Number(res.body.queryPageValue)).toBe(3);
    expect(res.body.paramId).toBe(goodId);
    expect(res.body.bodyTitle).toBe(payload.title);
  });
});