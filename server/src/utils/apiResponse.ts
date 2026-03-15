import { Response } from 'express';

export function successResponse(res: Response, data: any, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

export function errorResponse(res: Response, message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: any) {
  return res.status(statusCode).json({
    success: false,
    error: { code, message, ...(details && { details }) },
  });
}

export class AppError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) { super(message, 400, 'VALIDATION_ERROR'); }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') { super(message, 401, 'UNAUTHORIZED'); }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(message, 403, 'FORBIDDEN'); }
}
export class NotFoundError extends AppError {
  constructor(message = 'Not found') { super(message, 404, 'NOT_FOUND'); }
}
export class ConflictError extends AppError {
  constructor(message: string) { super(message, 409, 'CONFLICT'); }
}
