import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/apiResponse';
import logger from '../utils/logger';
import { env } from '../config/env';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error(err.message, { stack: err.stack });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  // Multer errors
  if (err.message && err.message.includes('File too large')) {
    return res.status(413).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: 'File exceeds maximum size of 50MB' },
    });
  }

  if (err.message && (err.message.includes('.xlsx') || err.message.includes('accepted'))) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_FILE_TYPE', message: err.message },
    });
  }

  // Handle specific technical errors gracefully for diagnostics
  if (err.message && err.message.includes('secret or public key must be provided')) {
    return res.status(500).json({
      success: false,
      error: { code: 'CONFIG_ERROR', message: 'Server configuration error: JWT secrets missing' },
    });
  }

  res.status(500).json({
    success: false,
    error: { 
      code: 'INTERNAL_ERROR', 
      message: env.NODE_ENV === 'production' 
        ? 'Something went wrong. Please check server logs.' 
        : err.message 
    },
  });
}
