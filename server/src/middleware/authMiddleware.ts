import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/apiResponse';

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  client_id: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('No token provided'));
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    return next(new UnauthorizedError('Invalid or expired token'));
  }
}
