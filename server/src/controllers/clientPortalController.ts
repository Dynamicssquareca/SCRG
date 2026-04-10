import { Request, Response, NextFunction } from 'express';
import dayjs from 'dayjs';
import { Client } from '../models/Client';
import { Case } from '../models/Case';
import { Report } from '../models/Report';
import { Upload } from '../models/Upload';
import { successResponse, ForbiddenError, NotFoundError } from '../utils/apiResponse';

const RESOLVED_STATUSES = ['resolved', 'closed', 'problem solved'];

function isResolved(status: string): boolean {
  return RESOLVED_STATUSES.some(s => String(status).toLowerCase().trim().includes(s));
}

/**
 * GET /client-portal/dashboard?month=X&year=Y
 * Returns the full dashboard data for the authenticated client user.
 */
export async function getClientDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = (req.user as any).client_id;
    if (!clientId) throw new ForbiddenError('No client linked to this account');

    const { month, year } = req.query;
    const m = month ? Number(month) : dayjs().month() + 1;
    const y = year ? Number(year) : dayjs().year();

    const clientInfo = await Client.findById(clientId);
    if (!clientInfo) throw new NotFoundError('Client not found');

    // Find the latest upload that has cases for this client
    const latestCase = await Case.findOne({ client_id: clientId }).sort({ createdAt: -1 });
    const uploadId = latestCase?.upload_id;

    // Get all cases for this client
    const allCases = await Case.find({ client_id: clientId });

    // Filter cases relevant to this month (reuses report generation logic)
    const relevantCases = allCases.filter((c: any) => {
      const createdD = c.created_on ? dayjs(c.created_on) : null;
      const updatedD = c.updated_on ? dayjs(c.updated_on) : null;
      const createdInMonth = createdD && createdD.month() + 1 === m && createdD.year() === y;
      const updatedInMonth = updatedD && updatedD.month() + 1 === m && updatedD.year() === y;

      let createdBeforeOrDuring = false;
      if (createdD) {
        if (createdD.year() < y || (createdD.year() === y && createdD.month() + 1 <= m)) {
          createdBeforeOrDuring = true;
        }
      }
      let resolvedBefore = false;
      if (isResolved(c.status_reason || '') && updatedD) {
        if (updatedD.year() < y || (updatedD.year() === y && updatedD.month() + 1 < m)) {
          resolvedBefore = true;
        }
      }
      const isOpenDuringMonth = createdBeforeOrDuring && !resolvedBefore;
      return createdInMonth || updatedInMonth || isOpenDuringMonth;
    });

    // Open cases: not resolved/closed
    const openCases = relevantCases.filter((c: any) => !isResolved(c.status_reason || ''));

    // Resolved cases: resolved/closed during selected month
    const resolvedCases = relevantCases.filter((c: any) => {
      if (!isResolved(c.status_reason || '')) return false;
      const updatedD = c.updated_on ? dayjs(c.updated_on) : null;
      return updatedD && updatedD.month() + 1 === m && updatedD.year() === y;
    });

    // Ticket counts for cases created this month
    const casesCreatedThisMonth = relevantCases.filter((c: any) => {
      const createdD = c.created_on ? dayjs(c.created_on) : null;
      return createdD && createdD.month() + 1 === m && createdD.year() === y;
    });

    const totalOpened = casesCreatedThisMonth.length;
    const totalClosed = resolvedCases.length;
    const pending = openCases.length;
    const reopened = relevantCases.filter((c: any) => String(c.status_reason).toLowerCase().trim() === 'reopened').length;
    const highPriority = relevantCases.filter((c: any) => String(c.priority).toLowerCase().includes('high')).length;

    const hoursConsumed = resolvedCases.reduce((sum: number, c: any) => sum + (Number(c.billable_duration) || 0), 0);
    const hoursOnOpen = openCases.reduce((sum: number, c: any) => sum + (Number(c.billable_duration) || 0), 0);

    const totalContracted = Number(clientInfo.total_contracted_hours) || 0;

    // Get previous month's report for starting balance
    const prevMonthIdx = m - 2;
    const prevMonthNum = prevMonthIdx < 0 ? 12 : prevMonthIdx + 1;
    const prevYearNum = prevMonthIdx < 0 ? y - 1 : y;

    const prevReport = await Report.findOne({ client_id: clientId, month: prevMonthNum, year: prevYearNum });
    const previousBalance = prevReport ? prevReport.remaining_balance : (Number(clientInfo.previous_balance_hours) || 0);
    const currentBalance = previousBalance - hoursConsumed;

    // Check if a generated report file exists for download
    const report = await Report.findOne({ client_id: clientId, month: m, year: y, file_data: { $ne: null } });

    successResponse(res, {
      clientInfo: {
        client_name: clientInfo.client_name,
        account_manager: clientInfo.account_manager,
        customer_success_mgr: clientInfo.customer_success_mgr,
        tool_version: clientInfo.tool_version,
        contract_start_date: clientInfo.contract_start_date,
        contract_end_date: clientInfo.contract_end_date,
      },
      hoursDetails: {
        totalContracted,
        previousBalance,
        hoursConsumed,
        hoursOnOpen,
        currentBalance,
      },
      ticketSummary: {
        totalOpened,
        totalClosed,
        pending,
        reopened,
        highPriority,
      },
      openCases: openCases.map((c: any, i: number) => ({
        sno: i + 1,
        case_number: c.case_number,
        contact: c.contact,
        subject: c.case_title,
        created_on: c.created_on,
        hours: Number(c.billable_duration) || 0,
        consultant: c.support_agent,
        status: c.status_reason,
      })),
      resolvedCases: resolvedCases.map((c: any, i: number) => ({
        sno: i + 1,
        case_number: c.case_number,
        contact: c.contact,
        subject: c.case_title,
        created_on: c.created_on,
        resolved_on: c.updated_on,
        consultant: c.support_agent,
        hours: Number(c.billable_duration) || 0,
      })),
      hasReport: !!report,
      reportId: report?._id?.toString() || null,
    });
  } catch (err) { next(err); }
}

/**
 * GET /client-portal/report/download?month=X&year=Y
 * Downloads the generated Excel report for the authenticated client.
 */
export async function downloadClientReport(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = (req.user as any).client_id;
    if (!clientId) throw new ForbiddenError('No client linked to this account');

    const { month, year } = req.query;
    const m = month ? Number(month) : dayjs().month() + 1;
    const y = year ? Number(year) : dayjs().year();

    const report = await Report.findOne({ client_id: clientId, month: m, year: y, file_data: { $ne: null } });
    if (!report || !report.file_data) throw new NotFoundError('Report not yet generated for this period');

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${report.file_name}"`,
      'Content-Length': String(report.file_data.length),
    });
    res.send(report.file_data);
  } catch (err) { next(err); }
}
