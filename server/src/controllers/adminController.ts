import { Request, Response, NextFunction } from 'express';
import { Client } from '../models/Client';
import { Upload } from '../models/Upload';
import { Case } from '../models/Case';
import { Report } from '../models/Report';
import { successResponse } from '../utils/apiResponse';

export async function clearAllData(req: Request, res: Response, next: NextFunction) {
  try {
    // We keep users to maintain login access
    await Promise.all([
      Client.deleteMany({}),
      Upload.deleteMany({}),
      Case.deleteMany({}),
      Report.deleteMany({})
    ]);

    successResponse(res, { message: 'All application data has been cleared successfully' });
  } catch (err) {
    next(err);
  }
}
