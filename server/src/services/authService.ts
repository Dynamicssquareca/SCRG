import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/apiResponse';

export async function authenticate(email: string, password: string) {
  const user = await User.findOne({ email, is_active: true });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) throw new UnauthorizedError('Invalid credentials');

  const tokenPayload = { id: user._id, email: user.email, role: user.role };
  const accessToken = jwt.sign(tokenPayload, env.ACCESS_TOKEN_SECRET, { expiresIn: env.ACCESS_TOKEN_EXPIRY as any });
  const refreshToken = jwt.sign(tokenPayload, env.REFRESH_TOKEN_SECRET, { expiresIn: env.REFRESH_TOKEN_EXPIRY as any });

  return {
    accessToken,
    refreshToken,
    user: { id: user._id, email: user.email, fullName: user.full_name, role: user.role },
  };
}

export function refreshAccessToken(refreshToken: string) {
  try {
    const decoded = jwt.verify(refreshToken, env.REFRESH_TOKEN_SECRET) as any;
    const tokenPayload = { id: decoded.id, email: decoded.email, role: decoded.role };
    const accessToken = jwt.sign(tokenPayload, env.ACCESS_TOKEN_SECRET, { expiresIn: env.ACCESS_TOKEN_EXPIRY as any });
    return { accessToken };
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}
