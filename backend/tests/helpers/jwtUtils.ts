import jwt from 'jsonwebtoken';
import { env } from '../../src/env.js';

export type TokenPayload = {
  id: string;
  isAdmin?: boolean;
  iat?: number;
  exp?: number;
};

export function decodeToken(token: string): TokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET!) as TokenPayload;
    return payload;
  } catch (err: unknown) {
    throw new Error(`Invalid JWT token: ${(err as Error).message}`);
  }
}