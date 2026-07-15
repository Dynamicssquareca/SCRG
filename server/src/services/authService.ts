import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import crypto from 'crypto';
import { User, IUser } from '../models/User';
import { env } from '../config/env';
import { UnauthorizedError, ValidationError } from '../utils/apiResponse';

export async function authenticate(email: string, password: string) {
  const user = await User.findOne({ email, is_active: true });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) throw new UnauthorizedError('Invalid credentials');

  // Enforce 2FA for ALL roles, including clients
  const tempPayload = { id: user._id, email: user.email, role: user.role, client_id: user.client_id || null, temp: true };
  const tempToken = jwt.sign(tempPayload, env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });

  if (!user.totp_enabled) {
    return { requiresSetup: true, tempToken };
  }
  return { requiresTOTP: true, tempToken };
}

export async function setupTOTP(userId: string, email: string) {
  const user = await User.findById(userId);
  if (!user) throw new UnauthorizedError('User not found');

  let secret = user.totp_secret;

  // Generate a new secret only if one doesn't already exist for this setup session
  if (!secret) {
    secret = authenticator.generateSecret();
    await User.findByIdAndUpdate(userId, { totp_secret: secret });
  }

  const otpauth = authenticator.keyuri(email, 'Dynamics Square - Support Portal', secret);
  const qrCodeUrl = await qrcode.toDataURL(otpauth);

  return { secret, qrCodeUrl };
}


export async function verifyTOTPSetup(userId: string, code: string) {
  const user = await User.findById(userId);
  if (!user || !user.totp_secret) throw new ValidationError('Invalid setup request');

  const isValid = authenticator.verify({ token: code, secret: user.totp_secret });
  if (!isValid) throw new UnauthorizedError('Invalid verification code');

  const recoveryCode = crypto.randomBytes(10).toString('hex');

  await User.findByIdAndUpdate(userId, {
    totp_enabled: true,
    totp_recovery_code: recoveryCode
  });

  return { recoveryCode };
}

export async function verifyTOTP(userId: string, code: string) {
  const user = await User.findById(userId);
  if (!user || !user.totp_enabled || !user.totp_secret) {
    throw new UnauthorizedError('2FA not enabled or configured properly');
  }

  let isValid = false;
  if (code === user.totp_recovery_code) {
    isValid = true;
    // Generate a new recovery code after use
    user.totp_recovery_code = crypto.randomBytes(10).toString('hex');
    await user.save();
  } else {
    isValid = authenticator.verify({ token: code, secret: user.totp_secret });
  }

  if (!isValid) throw new UnauthorizedError('Invalid authentication code');

  const tokenPayload = { id: user._id, email: user.email, role: user.role, client_id: user.client_id || null };
  const accessToken = jwt.sign(tokenPayload, env.ACCESS_TOKEN_SECRET, { expiresIn: env.ACCESS_TOKEN_EXPIRY as any });
  const refreshToken = jwt.sign(tokenPayload, env.REFRESH_TOKEN_SECRET, { expiresIn: env.REFRESH_TOKEN_EXPIRY as any });

  return {
    accessToken,
    refreshToken,
    user: { id: user._id, email: user.email, fullName: user.full_name, role: user.role, clientId: user.client_id || null },
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

export async function revealQRWithPasscode(email: string, passcode: string) {
  if (passcode !== env.STATIC_AUTH_PASSCODE) {
    throw new UnauthorizedError('Invalid passcode');
  }

  const user = await User.findOne({ email, is_active: true });
  if (!user) {
    throw new UnauthorizedError('User not found or inactive');
  }

  if (!user.totp_enabled || !user.totp_secret) {
    throw new ValidationError('2FA is not currently enabled for this user. Please log in normally to set it up.');
  }

  const otpauth = authenticator.keyuri(email, 'Dynamics Square - Support Portal', user.totp_secret);
  const qrCodeUrl = await qrcode.toDataURL(otpauth);

  return { qrCodeUrl };
}

export async function getUserQRCode(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new UnauthorizedError('User not found');

  if (!user.totp_enabled || !user.totp_secret) {
    throw new ValidationError('2FA is not enabled for this user');
  }

  const otpauth = authenticator.keyuri(user.email, 'Dynamics Square - Support Portal', user.totp_secret);
  const qrCodeUrl = await qrcode.toDataURL(otpauth);

  return { qrCodeUrl };
}
