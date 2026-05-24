import { Request, Response, NextFunction } from 'express';
import { Client } from '../models/Client';
import { Upload } from '../models/Upload';
import { Report } from '../models/Report';
import { Case } from '../models/Case';
import { successResponse } from '../utils/apiResponse';

const closedStatusRegex = /resolved|closed|problem solved/i;

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const { month, year, startDate, endDate } = req.query;
    const totalClients = await Client.countDocuments({ is_active: true });
    const totalUploads = await Upload.countDocuments();

    let reportFilter: any = {};
    let openCaseFilter: any = {};
    let closedCaseFilter: any = {};

    if (month && year) {
      reportFilter = { month: Number(month), year: Number(year) };

      const start = startDate ? new Date(startDate as string) : new Date(Number(year), Number(month) - 1, 1);
      const end = endDate ? new Date(endDate as string) : new Date(Number(year), Number(month), 0, 23, 59, 59, 999);

      openCaseFilter = {
        created_on: { $gte: start, $lte: end },
        status_reason: { $not: closedStatusRegex },
      };

      closedCaseFilter = {
        updated_on: { $gte: start, $lte: end },
        status_reason: { $regex: closedStatusRegex },
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
      totalClosedCases,
    });
  } catch (err) { next(err); }
}

export async function getCases(req: Request, res: Response, next: NextFunction) {
  try {
    const { month, year, status, startDate, endDate } = req.query;
    let caseFilter: any = {};

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

/** GET /dashboard/last-upload — returns the createdAt of the most recent upload */
export async function getLastUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const last = await Upload.findOne({}, { createdAt: 1 }).sort({ createdAt: -1 }).lean();
    successResponse(res, { lastUploadAt: last ? last.createdAt : null });
  } catch (err) { next(err); }
}

/** GET /dashboard/consultant-workload — open ticket counts grouped by support_agent */
export async function getConsultantWorkload(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await Case.aggregate([
      { $match: { status_reason: { $not: closedStatusRegex }, support_agent: { $nin: [null, ''] } } },
      { $group: { _id: '$support_agent', openCount: { $sum: 1 } } },
      { $sort: { openCount: -1 } },
      { $project: { _id: 0, agent: '$_id', openCount: 1 } },
    ]);
    successResponse(res, result);
  } catch (err) { next(err); }
}

/** GET /dashboard/chart/custom-comparison — compares two specific months */
export async function getCustomComparisonChart(req: Request, res: Response, next: NextFunction) {
  try {
    const { m1, y1, m2, y2 } = req.query;
    
    // Default to this month vs last month if not provided
    const now = new Date();
    const thisY = now.getFullYear();
    const thisM = now.getMonth();
    
    const month1 = m1 ? Number(m1) - 1 : thisM;
    const year1 = y1 ? Number(y1) : thisY;
    
    const month2 = m2 ? Number(m2) - 1 : (thisM === 0 ? 11 : thisM - 1);
    const year2 = y2 ? Number(y2) : (thisM === 0 ? thisY - 1 : thisY);

    const start1 = new Date(year1, month1, 1);
    const end1 = new Date(year1, month1 + 1, 0, 23, 59, 59, 999);
    
    const start2 = new Date(year2, month2, 1);
    const end2 = new Date(year2, month2 + 1, 0, 23, 59, 59, 999);

    const [open1, closed1, open2, closed2] = await Promise.all([
      Case.countDocuments({ created_on: { $gte: start1, $lte: end1 } }),                                               // all tickets created in month1
      Case.countDocuments({ updated_on: { $gte: start1, $lte: end1 }, status_reason: { $regex: closedStatusRegex } }), // tickets closed in month1
      Case.countDocuments({ created_on: { $gte: start2, $lte: end2 } }),                                               // all tickets created in month2
      Case.countDocuments({ updated_on: { $gte: start2, $lte: end2 }, status_reason: { $regex: closedStatusRegex } }), // tickets closed in month2
    ]);

    const formatLabel = (m: number, y: number) => {
      return new Date(y, m).toLocaleString('default', { month: 'short' }) + ' ' + y;
    };

    successResponse(res, {
      month1: { open: open1, closed: closed1, label: formatLabel(month1, year1) },
      month2: { open: open2, closed: closed2, label: formatLabel(month2, year2) },
    });
  } catch (err) { next(err); }
}

/** GET /dashboard/chart/client-breakdown — detailed ticket breakdown for a specific client */
export async function getClientBreakdownChart(req: Request, res: Response, next: NextFunction) {
  try {
    const { clientId, month, year } = req.query;
    if (!clientId) {
      return successResponse(res, { open: 0, closed: 0 });
    }

    const baseFilter: any = { client_id: clientId };

    // Only apply date filter when month AND year are explicitly provided
    if (month && year) {
      const m = Number(month) - 1;
      const y = Number(year);
      const start = new Date(y, m, 1);
      const end   = new Date(y, m + 1, 0, 23, 59, 59, 999);
      baseFilter.created_on = { $gte: start, $lte: end };
    }

    const [openCount, closedCount] = await Promise.all([
      Case.countDocuments({ ...baseFilter, status_reason: { $not: closedStatusRegex } }),
      Case.countDocuments({ ...baseFilter, status_reason: { $regex: closedStatusRegex } }),
    ]);

    successResponse(res, { open: openCount, closed: closedCount });
  } catch (err) { next(err); }
}
