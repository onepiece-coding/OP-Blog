import mongoose from 'mongoose';

/**
 * Clears all collections. Use in afterEach to ensure fresh state.
 */
export async function clearDatabase() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    const coll = collections[key];
    if (!coll) continue;
    try {
      await coll.deleteMany({});
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      // ignore delete errors for safety in tear-down
    }
  }
}

/**
 * Drop all collections (useful for full reset).
 */
export async function dropDatabase() {
  try {
    await mongoose.connection.dropDatabase();
  } catch {}
}

/**
 * Disconnect mongoose
 */
export async function disconnectDB() {
  try {
    await mongoose.disconnect();
  } catch {}
}