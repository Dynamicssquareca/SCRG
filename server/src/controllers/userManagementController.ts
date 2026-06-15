import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import * as authService from '../services/authService';
import { successResponse, NotFoundError } from '../utils/apiResponse';

/* GET /users - list all users (admin only) */
export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const users = await User.find({}, {
      password_hash: 0,
      totp_secret: 0,
      totp_recovery_code: 0,
    }).sort({ createdAt: -1 });

    const result = users.map(u => ({
      id: u._id,
      full_name: u.full_name,
      email: u.email,
      role: u.role,
      is_active: u.is_active,
      totp_enabled: u.totp_enabled,
      createdAt: u.createdAt,
    }));

    successResponse(res, result);
  } catch (err) { next(err); }
}

/* DELETE /users/:id/totp - revoke 2FA for a user (admin only) */
export async function revokeTotp(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    
    const result = await User.updateOne(
      { _id: id },
      { 
        $set: { totp_enabled: false },
        $unset: { totp_secret: 1, totp_recovery_code: 1 }
      }
    );

    if (result.matchedCount === 0) {
      throw new NotFoundError('User not found');
    }

    successResponse(res, { message: '2FA has been revoked for this user' });
  } catch (err) { next(err); }
}

/* GET /users/:id/qr-code - get existing QR code for a user (admin only) */
export async function getQrCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const result = await authService.getUserQRCode(id);
    successResponse(res, result);
  } catch (err) { next(err); }
}
