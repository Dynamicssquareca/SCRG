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
      
      // Filter cases by the selected month using created_on
      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
      caseFilter.created_on = { $gte: startDate, $lte: endDate };
    }

    const totalReportsGenerated = await Report.countDocuments(reportFilter);
    const totalCases = await Case.countDocuments(caseFilter);
    
    // Categorize closed cases (case insensitive)
    const closedStatusRegex = /resolved|closed|problem solved/i;
    const closedFilter = { ...caseFilter, status_reason: { $regex: closedStatusRegex } };
    const totalClosedCases = await Case.countDocuments(closedFilter);
    const totalOpenCases = totalCases - totalClosedCases;

    successResponse(res, {
      totalClients,
      totalUploads,
      totalReportsGenerated,
      totalCases,
      totalOpenCases,
      totalClosedCases
    });
  } catch (err) { next(err); }
}
