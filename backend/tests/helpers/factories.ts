import User from '../../src/models/User.js';
import Category from '../../src/models/Category.js';
import Post from '../../src/models/Post.js';
import Comment from '../../src/models/Comment.js';
import VerificationToken from '../../src/models/VerificationToken.js';
import mongoose from 'mongoose';

type PartialRec<T> = Partial<T> & Record<string, any>;

export const userFactory = async (
  overrides: PartialRec<{
    username: string;
    email: string;
    password: string;
    isAdmin: boolean;
    isAccountVerified: boolean;
  }> = {},
) => {
  const random = Math.random().toString(36).slice(2, 8);
  const data = {
    username: `u_${random}`,
    email: `u_${Date.now()}_${random}@test.local`,
    password: 'Aa!123456',
    isAdmin: false,
    isAccountVerified: true,
    ...overrides,
  };
  
  const u = new User(data);
  await u.save();
  return u;
};

export const adminFactory = async (overrides: PartialRec<any> = {}) => {
  return userFactory({ isAdmin: true, ...overrides });
};

export const categoryFactory = async (
  overrides: PartialRec<{ title: string; user?: mongoose.Types.ObjectId }> = {},
) => {
  const title = overrides.title ?? `cat_${Date.now()}`;
  const user = overrides.user ?? (await userFactory())._id;
  const c = new Category({ title, user });
  await c.save();
  return c;
};

export const postFactory = async (
  overrides: PartialRec<{
    title: string;
    description: string;
    user?: mongoose.Types.ObjectId;
    categoryId?: mongoose.Types.ObjectId;
    image?: any;
  }> = {},
) => {
  const user = overrides.user ?? (await userFactory())._id;
  const category = overrides.categoryId ?? (await categoryFactory({}))._id;
  const post = new Post({
    title: overrides.title ?? 'Test post title',
    description:
      overrides.description ??
      'This is a test post content with enough characters.',
    user,
    categoryId: category,
    image: overrides.image ?? { url: '', publicId: null },
    ...overrides,
  });
  await post.save();
  return post;
};

export const commentFactory = async (
  overrides: PartialRec<{
    postId?: mongoose.Types.ObjectId;
    user?: mongoose.Types.ObjectId;
    text?: string;
  }> = {},
) => {
  const post = overrides.postId ?? (await postFactory())._id;
  const user = overrides.user ?? (await userFactory())._id;
  const comment = new Comment({
    postId: post,
    user,
    text: overrides.text ?? 'A comment text',
    username: 'commenter',
  });
  await comment.save();
  return comment;
};

export async function createVerificationToken(userId: string, token?: string) {
  const v = new VerificationToken({ userId, token: token ?? Math.random().toString(36).slice(2) });
  await v.save();
  return v;
}