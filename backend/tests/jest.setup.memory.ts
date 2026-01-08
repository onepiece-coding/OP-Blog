import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();

  // Optional worker isolation (safe even if undefined)
  const workerId = process.env.JEST_WORKER_ID ?? '0';
  const uri = mongo.getUri(`jest-e2e-${workerId}`);

  await mongoose.connect(uri);
});

afterEach(async () => {
  const collections = await mongoose.connection.db!.collections();

  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongo.stop();
});