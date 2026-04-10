import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { Client } from '../models/Client';
import { successResponse, ValidationError, ConflictError, NotFoundError, ForbiddenError } from '../utils/apiResponse';

/**
 * GET /client-access
 * Lists all client portal accounts with their linked client info.
 */
export async function listClientAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== 'admin') throw new ForbiddenError();

    const clientUsers = await User.find({ role: 'client' })
      .select('-password_hash')
      .populate('client_id', 'client_name is_active')
      .sort({ createdAt: -1 });

    // Also get all clients so the admin can see which ones don't have access yet
    const allClients = await Client.find({ is_active: true }).select('client_name').sort({ client_name: 1 });

    const clientsWithAccess = clientUsers.map((u: any) => ({
      userId: u._id,
      email: u.email,
      fullName: u.full_name,
      clientId: u.client_id?._id || null,
      clientName: u.client_id?.client_name || 'Unlinked',
      isActive: u.is_active,
      createdAt: u.createdAt,
    }));

    successResponse(res, {
      portalUsers: clientsWithAccess,
      allClients: allClients.map((c: any) => ({ id: c._id, name: c.client_name })),
    });
  } catch (err) { next(err); }
}

/**
 * POST /client-access
 * Creates a new client portal user or updates an existing one.
 * Body: { clientId, email, password, fullName? }
 */
export async function createClientAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== 'admin') throw new ForbiddenError();

    const { clientId, email, password, fullName } = req.body;
    if (!clientId || !email || !password) {
      throw new ValidationError('clientId, email, and password are required');
    }

    // Verify client exists
    const client = await Client.findById(clientId);
    if (!client) throw new NotFoundError('Client not found');

    // Check if email already exists for a different purpose
    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.role !== 'client') {
      throw new ConflictError('This email is already used by an internal user');
    }

    // Check if this client already has a portal user
    const existingClientUser = await User.findOne({ client_id: clientId, role: 'client' });

    if (existingClientUser) {
      // Update existing portal user
      existingClientUser.email = email;
      existingClientUser.password_hash = password; // Will be hashed by pre-save hook
      existingClientUser.full_name = fullName || client.client_name;
      existingClientUser.is_active = true;
      await existingClientUser.save();

      successResponse(res, {
        message: 'Client portal access updated',
        userId: existingClientUser._id,
        email: existingClientUser.email,
      });
    } else if (existingUser) {
      // Email exists but for a different client - conflict
      throw new ConflictError('This email is already in use');
    } else {
      // Create new portal user
      const newUser = await User.create({
        email,
        password_hash: password, // Will be hashed by pre-save hook
        full_name: fullName || client.client_name,
        role: 'client',
        client_id: clientId,
        is_active: true,
      });

      successResponse(res, {
        message: 'Client portal access created',
        userId: newUser._id,
        email: newUser.email,
      }, 201);
    }
  } catch (err) { next(err); }
}

/**
 * PUT /client-access/:userId/reset-password
 * Resets the password for a client portal user.
 * Body: { password }
 */
export async function resetClientPassword(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== 'admin') throw new ForbiddenError();

    const { userId } = req.params;
    const { password } = req.body;
    if (!password) throw new ValidationError('Password is required');

    const user = await User.findById(userId);
    if (!user || user.role !== 'client') throw new NotFoundError('Client portal user not found');

    user.password_hash = password; // Will be hashed by pre-save hook
    await user.save();

    successResponse(res, { message: 'Password reset successfully' });
  } catch (err) { next(err); }
}

/**
 * DELETE /client-access/:userId
 * Deactivates a client portal user.
 */
export async function revokeClientAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== 'admin') throw new ForbiddenError();

    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user || user.role !== 'client') throw new NotFoundError('Client portal user not found');

    user.is_active = false;
    await user.save();

    successResponse(res, { message: 'Client portal access revoked' });
  } catch (err) { next(err); }
}
