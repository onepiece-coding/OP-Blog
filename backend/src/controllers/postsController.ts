import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import createError from 'http-errors';
import { z } from 'zod';
import xss from 'xss';
import Post from '../models/Post.js';
import Category from '../models/Category.js';
import Comment from '../models/Comment.js';
import { uploadBufferToCloudinary, removeImage } from '../utils/cloudinary.js';

interface MulterReq extends Request {
  file?: Express.Multer.File;
  user?: any;
}

// query schema for get all posts
const getPostsQuerySchema = z.object({
  pageNumber: z.preprocess((val) => {
    const s = Array.isArray(val) ? val[0] : (val ?? '1');
    const n = Number(s);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }, z.number().int().min(1).default(1)),
  text: z.preprocess((val) => {
    const s = Array.isArray(val) ? val[0] : val;
    if (typeof s !== 'string' || s.trim() === '') return '';
    return xss(s.trim());
  }, z.string().optional().default('')),
  category: z.preprocess((val) => {
    const s = Array.isArray(val) ? val[0] : val;
    if (typeof s !== 'string' || s.trim() === '') return '';
    return xss(s.trim());
  }, z.string().optional().default('')),
});

/**------------------------------------------------
 * @desc    Create New Post
 * @route  /api/v1/posts
 * @method POST
 * @access private (only logged in user)
---------------------------------------------------*/
export const createPostCtrl = asyncHandler(
  async (req: MulterReq, res: Response) => {
    const { title, description, categoryId } = req.body as {
      title: string;
      description: string;
      categoryId: string;
    };

    const category = await Category.findById(categoryId);
    if (!category) throw createError(404, 'Category not found!');

    if (req.file && req.file.buffer) {
      const uploadRes = await uploadBufferToCloudinary(req.file.buffer, {
        folder: 'posts',
      });
      req.body.image = {
        url: uploadRes.secure_url,
        publicId: uploadRes.public_id,
      };
    }

    const post = await Post.create({
      title,
      description,
      user: req.user.id,
      categoryId: category._id,
      image: (req.body as any).image ?? { url: '', publicId: null },
    });

    await post.populate('user', 'username');
    await post.populate('categoryId', 'title');

    res.status(201).json(post);
  },
);

/**------------------------------------------------
 * @desc   Get All Posts
 * @route  /api/v1/posts
 * @method GET
 * @access public
---------------------------------------------------*/
export const getAllPostsCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = getPostsQuerySchema.safeParse(req.query);
    if (!parsed.success) throw createError(400, 'Invalid query parameters');

    const { pageNumber, text, category } = parsed.data;
    const POST_PER_PAGE = 4;
    const skip = (pageNumber - 1) * POST_PER_PAGE;

    const query: Record<string, any> = {};
    const useText = Boolean(text && text.length > 0);
    if (useText) query.$text = { $search: text };

    if (category && category.length > 0) {
      const cat = await Category.findOne({
        title: new RegExp(`^${category}$`, 'i'),
      });
      if (!cat) {
        res.status(200).json({ posts: [], totalPages: 0 });
        return;
      } 
      query.categoryId = cat!._id;
    }

    const totalPosts = await Post.countDocuments(query);

    let cursor = Post.find(query)
      .skip(skip)
      .limit(POST_PER_PAGE)
      .populate('user', ['-password'])
      .populate('categoryId', 'title');

    if (useText) {
      cursor = cursor
        .select({ score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, createdAt: -1 });
    } else {
      cursor = cursor.sort({ createdAt: -1 });
    }

    const posts = await cursor.exec();

    res
      .status(200)
      .json({ posts, totalPages: Math.ceil(totalPosts / POST_PER_PAGE) });
  },
);

/**------------------------------------------------
 * @desc    Get Post Count
 * @route  /api/v1/posts/count
 * @method GET
 * @access public
---------------------------------------------------*/
export const getPostCountCtrl = asyncHandler(
  async (_req: Request, res: Response) => {
    const count = await Post.countDocuments();
    res.status(200).json(count);
  },
);

/**------------------------------------------------
 * @desc    Get Single Post
 * @route  /api/v1/posts/:id
 * @method GET
 * @access public
---------------------------------------------------*/
export const getSinglePostCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const post = await Post.findById(req.params.id)
      .populate('user', ['-password'])
      .populate('categoryId', 'title')
      .populate('comments');
    if (!post) {
      throw createError(404, 'Post not found!');
    }
    res.status(200).json(post);
  },
);

/**------------------------------------------------
 * @desc   Delete Post
 * @route  /api/v1/posts/:id
 * @method DELETE
 * @access private (only admin or owner of the post)
---------------------------------------------------*/
export const deletePostCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const post = await Post.findById(req.params.id);
    if (!post) {
      throw createError(404, 'Post not found!');
    }

    if (req.user.isAdmin || req.user.id === post.user.toString()) {
      if (post.image.publicId !== null) await removeImage(post.image.publicId!);
      await Comment.deleteMany({ postId: post._id });
      await Post.findByIdAndDelete(req.params.id);


      res.status(200).json({
        message: 'post has been deleted successsfully',
        postId: post._id,
      });
    } else {
      throw createError(403, 'Access denied, forbidden!');
    }
  },
);

/**------------------------------------------------
 * @desc   Update Post
 * @route  /api/v1/posts/:id
 * @method PUT
 * @access private (only the owner of the post)
---------------------------------------------------*/
export const updatePostCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const post = await Post.findById(req.params.id);
    if (!post) {
      throw createError(404, 'Post not found!');
    }

    if (req.user.id !== post.user.toString()) {
      throw createError(403, 'Access denied, you are not allowed!');
    }

    const updates: Partial<{
      title: string;
      description: string;
      categoryId: string;
    }> = {};

    if (req.body.title) updates.title = req.body.title;
    if (req.body.description) updates.description = req.body.description;
    if (req.body.categoryId) {
      const category = await Category.findById(req.body.categoryId);
      if (!category) throw createError(404, 'Category not found');
      updates.categoryId = req.body.categoryId;
    }

    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      {
        $set: updates,
      },
      { new: true },
    )
      .populate('user', ['-password'])
      .populate('categoryId', 'title')
      .populate('comments');

    res.status(200).json(updatedPost);
  },
);

/**------------------------------------------------
 * @desc   Update Post Image
 * @route  /api/v1/posts/update-image/:id
 * @method PUT
 * @access private (only the owner of the post)
---------------------------------------------------*/
export const updatePostImageCtrl = asyncHandler(
  async (req: MulterReq, res: Response) => {
    if (!req.file) throw createError(400, 'No image provided!');

    const post = await Post.findById(req.params.id);
    if (!post) throw createError(404, 'Post not found!');
    if (req.user.id !== post.user.toString())
      throw createError(403, 'Access denied, you are not allowed!');

    const uploadRes = await uploadBufferToCloudinary(req.file.buffer, {
      folder: 'posts',
    });
    const image = { url: uploadRes.secure_url, publicId: uploadRes.public_id };

    if (post.image?.publicId) await removeImage(post.image.publicId);

    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      { $set: { image } },
      { new: true },
    );
    res.status(200).json(updatedPost);
  },
);

/**------------------------------------------------
 * @desc   Toggle Like
 * @route  /api/v1/posts/like/:id
 * @method PUT
 * @access private (only the logged in user)
---------------------------------------------------*/
export const toggleLikeCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const loggedInUser = req.user.id;
    const { id: postId } = req.params;
    let post = await Post.findById(postId);
    if (!post) {
      throw createError(404, 'Post not found!');
    }

    const isPostAlreadyLiked = post.likes.find(
      (user) => user.toString() === loggedInUser,
    );

    if (isPostAlreadyLiked) {
      post = await Post.findByIdAndUpdate(
        postId,
        {
          $pull: { likes: loggedInUser },
        },
        { new: true },
      );
    } else {
      post = await Post.findByIdAndUpdate(
        postId,
        {
          $addToSet: { likes: loggedInUser },
        },
        { new: true },
      );
    }

    res.status(200).json(post);
  }
);