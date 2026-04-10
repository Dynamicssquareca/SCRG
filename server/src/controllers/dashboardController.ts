import { Request, Response, NextFunction } from 'express';
import { Client } from '../models/Client';
import { Upload } from '../models/Upload';
import { Report } from '../models/Report';
import { Case } from '../models/Case';
import { successResponse } from '../utils/apiResponse';

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const { month, year, startDate, endDate } = req.query;
    const totalClients = await Client.countDocuments({ is_active: true });
    const totalUploads = await Upload.countDocuments();

    let reportFilter: any = {};
    let openCaseFilter: any = {};
    let closedCaseFilter: any = {};
    const closedStatusRegex = /resolved|closed|problem solved/i;

    if (month && year) {
      reportFilter = { month: Number(month), year: Number(year) };
      
      const start = startDate ? new Date(startDate as string) : new Date(Number(year), Number(month) - 1, 1);
      const end = endDate ? new Date(endDate as string) : new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
      
      openCaseFilter = {
        created_on: { $gte: start, $lte: end },
        status_reason: { $not: closedStatusRegex }
      };

      closedCaseFilter = {
        updated_on: { $gte: start, $lte: end },
        status_reason: { $regex: closedStatusRegex }
      };
    } else {
      openCaseFilter = { status_reason: { $not: closedStatusRegex } };
      closedCaseFilter = { status_reason: { $regex: closedStatusRegex } };
    }

    const totalReportsGenerated = await Report.countDocuments(reportFilter);
    const totalOpenCases = await Case.countDocuments(openCaseFilter);
    const totalClosedCases = await Case.countDocuments(closedCaseFilter);
    const totalCases = totalOpenCases + totalClosedCases;

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

export async function getCases(req: Request, res: Response, next: NextFunction) {
  try {
    const { month, year, status, startDate, endDate } = req.query;
    let caseFilter: any = {};
    const closedStatusRegex = /resolved|closed|problem solved/i;

    if (month && year) {
      const start = startDate ? new Date(startDate as string) : new Date(Number(year), Number(month) - 1, 1);
      const end = endDate ? new Date(endDate as string) : new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
      
      if (status === 'closed') {
        caseFilter.updated_on = { $gte: start, $lte: end };
        caseFilter.status_reason = { $regex: closedStatusRegex };
      } else if (status === 'open') {
        caseFilter.created_on = { $gte: start, $lte: end };
        caseFilter.status_reason = { $not: closedStatusRegex };
      }
    } else {
      if (status === 'closed') {
        caseFilter.status_reason = { $regex: closedStatusRegex };
      } else if (status === 'open') {
        caseFilter.status_reason = { $not: closedStatusRegex };
      }
    }

    const sortOption = status === 'closed' ? { updated_on: -1 } : { created_on: -1 };
    // @ts-ignore
    const cases = await Case.find(caseFilter).sort(sortOption);
    successResponse(res, cases);
  } catch (err) { next(err); }
}
