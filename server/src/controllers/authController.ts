import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/authService';
import { successResponse, ValidationError } from '../utils/apiResponse';

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new ValidationError('Email and password are required');
    const result = await authService.authenticate(email, password);
    successResponse(res, result);
  } catch (err) { next(err); }
}

export async function setupTotp(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const email = req.user!.email;
    const result = await authService.setupTOTP(userId, email);
    successResponse(res, result);
  } catch (err) { next(err); }
}

export async function verifyTotpSetup(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { code } = req.body;
    if (!code) throw new ValidationError('Verification code is required');
    const result = await authService.verifyTOTPSetup(userId, code);
    successResponse(res, result);
  } catch (err) { next(err); }
}

export async function verifyTotp(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { code } = req.body;
    if (!code) throw new ValidationError('Verification code is required');
    const result = await authService.verifyTOTP(userId, code);
    successResponse(res, result);
  } catch (err) { next(err); }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new ValidationError('Refresh token is required');
    const result = authService.refreshAccessToken(refreshToken);
    successResponse(res, result);
  } catch (err) { next(err); }
}

export async function logout(_req: Request, res: Response) {
  successResponse(res, { message: 'Logged out successfully' });
}
