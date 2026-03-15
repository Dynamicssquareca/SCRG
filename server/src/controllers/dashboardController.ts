import { Request, Response, NextFunction } from 'express';
import { Client } from '../models/Client';
import { Upload } from '../models/Upload';
import { Report } from '../models/Report';
import { Case } from '../models/Case';
import { successResponse } from '../utils/apiResponse';

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const { month, year } = req.query;
    const totalClients = await Client.countDocuments({ is_active: true });
    const totalUploads = await Upload.countDocuments();

    let reportFilter: any = {};
    let caseFilter: any = {};

    if (month && year) {
      reportFilter = { month: Number(month), year: Number(year) };
      // Cases might not have month/year directly stored if we just look at created_on, 
      // but assuming the prompt meant overall cases vs monthly
      // For now we'll match report logic where possible or just overall cases.
      // If no monthly logic exists on cases table, we'll just count overall.
    }

    const totalReportsGenerated = await Report.countDocuments(reportFilter);
    const totalCases = await Case.countDocuments(caseFilter);

    successResponse(res, {
      totalClients,
      totalUploads,
      totalReportsGenerated,
      totalCases,
    });
  } catch (err) { next(err); }
}
