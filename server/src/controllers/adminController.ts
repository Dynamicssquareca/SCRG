import { Request, Response, NextFunction } from 'express';
import { Client } from '../models/Client';
import { Upload } from '../models/Upload';
import { Case } from '../models/Case';
import { Report } from '../models/Report';
import { successResponse } from '../utils/apiResponse';

export async function clearAllData(req: Request, res: Response, next: NextFunction) {
  try {
    // We keep users and clients (Client Master) - only clear transactional data
    await Promise.all([
      Upload.deleteMany({}),
      Case.deleteMany({}),
      Report.deleteMany({})
    ]);

    successResponse(res, { message: 'All uploads, cases, and reports have been cleared. Client Master is preserved.' });
  } catch (err) {
    next(err);
  }
}
