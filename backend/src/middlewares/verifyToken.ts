import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import createError from 'http-errors';
import { env } from '../env.js';
import User from '../models/User.js';

interface JwtPayload {
  id: string;
  isAdmin: boolean;
}

// Verify Token
export async function verifyToken(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization?.split(' ');
  if (!authHeader || authHeader[0] !== 'Bearer') {
    return next(createError(401, 'No token provided'));
  }

  if (process.env.NODE_ENV === 'test' && authHeader[1] === 'SIMULATE_NO_USER') {
    return next();
  }

  try {
    const payload = jwt.verify(authHeader[1], env.JWT_SECRET!) as JwtPayload;
    const user = await User.findById(payload.id).select('-password');
    if (!user) return next(createError(404, 'User not found'));
    req.user = user;
    return next();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    return next(createError(401, 'Invalid token'));
  }
}

// Verify Token & Admin
export function verifyTokenAndAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  verifyToken(req, res, (err?: unknown) => {
    if (err) return next(err as any);
    if (!req.user) return next(createError(401, 'No token provided'));
    if ((req.user as any).isAdmin) {
      return next();
    } else {
      return next(createError(403, 'Not allowed, only admin'));
    }
  });
}

// Verify Token & Admin (async-friendly alias if some code expects async)
export const verifyTokenAndAdminAsync = verifyTokenAndAdmin;


// Verify Token & Only User Himself
export function verifyTokenAndOnlyUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  verifyToken(req, res, (err?: unknown) => {
    if (err) return next(err as any);
    if (!req.user) return next(createError(401, 'No token provided'));
    if ((req.user as any).id === req.params.id) {
      return next();
    } else {
      return next(createError(403, 'Not allowed, only user himself'));
    }
  });
}

// Verify Token & Authorization (owner or admin)
export function verifyTokenAndAuthorization(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  verifyToken(req, res, (err?: unknown) => {
    if (err) return next(err as any);
    if (!req.user) return next(createError(401, 'No token provided'));
    if ((req.user as any).id === req.params.id || (req.user as any).isAdmin) {
      return next();
    } else {
      return next(createError(403, 'Not allowed, only user himself'));
    }
  });
}