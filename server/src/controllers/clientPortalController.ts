import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { Client } from '../models/Client';
import { Case } from '../models/Case';
import { Report } from '../models/Report';
import { Upload } from '../models/Upload';
import { ClientReachout } from '../models/ClientReachout';
import { User } from '../models/User';
import { sendEmail } from '../services/emailService';
import { env } from '../config/env';
import logger from '../utils/logger';
import { successResponse, ForbiddenError, NotFoundError } from '../utils/apiResponse';
import { generateClientPortalPdf, ClientPortalPdfData } from '../services/pdfReportService';

const RESOLVED_STATUSES = ['resolved', 'closed', 'problem solved'];

function isResolved(status: string): boolean {
  return RESOLVED_STATUSES.some(s => String(status).toLowerCase().trim().includes(s));
}

/**
 * Shared helper to compute all dashboard / report details for a client.
 */
export async function getClientDashboardDataHelper(clientId: string, m: number, y: number) {
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

  return {
    clientInfo: {
      client_name: clientInfo.client_name,
      account_manager: clientInfo.account_manager || '',
      customer_success_mgr: clientInfo.customer_success_mgr || '',
      tool_version: clientInfo.tool_version || '',
      contract_start_date: clientInfo.contract_start_date ? clientInfo.contract_start_date.toISOString() : null,
      contract_end_date: clientInfo.contract_end_date ? clientInfo.contract_end_date.toISOString() : null,
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
    },
    openCases: openCases.map((c: any, i: number) => ({
      sno: i + 1,
      case_number: c.case_number,
      contact: c.contact,
      subject: c.case_title,
      created_on: c.created_on ? c.created_on.toISOString() : null,
      hours: Number(c.billable_duration) || 0,
      consultant: c.support_agent,
      status: c.status_reason,
    })),
    resolvedCases: resolvedCases.map((c: any, i: number) => ({
      sno: i + 1,
      case_number: c.case_number,
      contact: c.contact,
      subject: c.case_title,
      created_on: c.created_on ? c.created_on.toISOString() : null,
      resolved_on: c.updated_on ? c.updated_on.toISOString() : null,
      consultant: c.support_agent,
      hours: Number(c.billable_duration) || 0,
    })),
    hasReport: !!report,
    reportId: report?._id?.toString() || null,
  };
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

    const data = await getClientDashboardDataHelper(clientId, m, y);
    successResponse(res, data);
  } catch (err) { next(err); }
}

/**
 * GET /client-portal/report/download?month=X&year=Y
 * Downloads the generated Excel report or dynamically generated PDF report for the authenticated client.
 */
export async function downloadClientReport(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = (req.user as any).client_id;
    if (!clientId) throw new ForbiddenError('No client linked to this account');

    const { month, year, format } = req.query;
    const m = month ? Number(month) : dayjs().month() + 1;
    const y = year ? Number(year) : dayjs().year();

    if (format === 'pdf') {
      const data = await getClientDashboardDataHelper(clientId, m, y);
      const monthStart = new Date(y, m - 1, 1);
      const monthName = dayjs(monthStart).format('MMMM');

      const pdfData: ClientPortalPdfData = {
        month: m,
        year: y,
        monthName,
        clientInfo: data.clientInfo,
        hoursDetails: data.hoursDetails,
        ticketSummary: data.ticketSummary,
        openCases: data.openCases,
        resolvedCases: data.resolvedCases,
      };

      const pdfBuffer = await generateClientPortalPdf(pdfData);

      const cleanClientName = data.clientInfo.client_name.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Support_Report_${cleanClientName}_${monthName.substring(0, 3)}_${y}.pdf`;

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      });
      return res.send(pdfBuffer);
    }

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

/**
 * POST /client-portal/reachout
 * Submits a reachout comment on a particular ticket.
 */
export async function createReachout(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = (req.user as any).client_id;
    if (!clientId) throw new ForbiddenError('No client linked to this account');

    const { case_number, assigned_to, comment } = req.body;
    if (!case_number || !assigned_to || !comment) {
      return res.status(400).json({
        success: false,
        error: { message: 'case_number, assigned_to, and comment are required' }
      });
    }

    // Verify case belongs to this client
    const ticket = await Case.findOne({ case_number, client_id: clientId });
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: { message: `Ticket ${case_number} not found or does not belong to this client.` }
      });
    }

    // Create the reachout request
    const reachout = await ClientReachout.create({
      client_id: new mongoose.Types.ObjectId(clientId),
      case_number,
      client_user_id: new mongoose.Types.ObjectId(req.user!.id),
      assigned_to,
      comment,
      status: 'pending',
    });

    // Send the support notification email synchronously to prevent Vercel from freezing/terminating the serverless function mid-connection
    const _userId = req.user!.id;
    const _userEmail = req.user!.email;
    try {
      const emailMap: Record<string, string> = {
        'Customer success manager': 'gopal.kaushal@dynamicssquare.com',
        'Account manager': 'arish.siddiqui@dynamicssquare.com',
      };
      const recipientEmail = emailMap[assigned_to] || 'gopal.kaushal@dynamicssquare.com';

      const clientInfo = await Client.findById(clientId);
      const clientName = clientInfo ? clientInfo.client_name : 'Unknown Client';

      const userInfo = await User.findById(_userId);
      const userFullName = userInfo ? userInfo.full_name : 'Portal Client User';
      const userEmail = userInfo ? userInfo.email : _userEmail;

      const subject = `[Support Request] New Comment on Ticket ${case_number} - ${clientName}`;
      const dashboardUrl = `https://scrg-tau.vercel.app/dashboard`;

      const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0b0f1a; color: #f1f5f9; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); overflow: hidden; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);">
          <div style="background: linear-gradient(135deg, #6366F1, #818CF8); padding: 28px 24px; text-align: center;">
            <h2 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.3px;">New Support Request Comment</h2>
            <p style="margin: 6px 0 0; color: rgba(255, 255, 255, 0.85); font-size: 13px; font-weight: 500;">Dynamics Square™ Client Portal</p>
          </div>
          <div style="padding: 24px; line-height: 1.6; background-color: #0b0f1a;">
            <div style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 18px; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; color: rgba(241, 245, 249, 0.6); font-weight: 600; width: 130px;">Ticket No:</td>
                  <td style="padding: 6px 0; color: #818CF8; font-weight: 700; font-family: monospace; font-size: 14px;">${case_number}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: rgba(241, 245, 249, 0.6); font-weight: 600;">Client Name:</td>
                  <td style="padding: 6px 0; color: #f1f5f9; font-weight: 600;">${clientName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: rgba(241, 245, 249, 0.6); font-weight: 600;">Submitted By:</td>
                  <td style="padding: 6px 0; color: #f1f5f9; font-weight: 500;">${userFullName} (${userEmail})</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: rgba(241, 245, 249, 0.6); font-weight: 600;">Assigned To:</td>
                  <td style="padding: 6px 0; color: #FB923C; font-weight: 700;">${assigned_to}</td>
                </tr>
              </table>
            </div>
            <div style="margin-bottom: 24px;">
              <h4 style="margin: 0 0 10px; color: rgba(241, 245, 249, 0.8); font-size: 13px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700;">Message/Comment:</h4>
              <div style="background-color: rgba(255, 255, 255, 0.02); border-left: 4px solid #6366F1; border-radius: 4px; padding: 16px; font-size: 14px; color: #e2e8f0; white-space: pre-wrap; font-style: italic; line-height: 1.5;">${comment}</div>
            </div>
            <div style="text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.06);">
              <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366F1, #818CF8); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 13px; box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);">View Dashboard</a>
            </div>
          </div>
          <div style="background-color: rgba(0, 0, 0, 0.25); padding: 16px; text-align: center; font-size: 11px; color: rgba(241, 245, 249, 0.35); border-top: 1px solid rgba(255, 255, 255, 0.04);">
            This is an automated notification from Dynamics Square™ Client Portal. Please do not reply directly to this email.
          </div>
        </div>
      `;

      await sendEmail({ to: recipientEmail, subject, html });
      logger.info(`Support request notification email sent to ${recipientEmail}`);
    } catch (emailErr) {
      logger.error('Failed to send support comment notification email', emailErr);
    }

    // Respond to the client after email logic is done
    successResponse(res, {
      message: 'Reachout request submitted successfully',
      data: reachout
    });
  } catch (err) {
    next(err);
  }
}


/**
 * GET /client-portal/reachouts
 * Returns all reachout requests submitted by the authenticated client.
 */
export async function getMyReachouts(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = (req.user as any).client_id;
    if (!clientId) throw new ForbiddenError('No client linked to this account');

    const reachouts = await ClientReachout.find({ client_id: clientId })
      .sort({ createdAt: -1 });

    successResponse(res, reachouts);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /client-portal/reachouts/:id
 * Deletes a reachout request belonging to the authenticated client.
 */
export async function deleteReachout(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = (req.user as any).client_id;
    if (!clientId) throw new ForbiddenError('No client linked to this account');

    const { id } = req.params;
    const reachout = await ClientReachout.findOneAndDelete({ _id: id, client_id: clientId });

    if (!reachout) {
      return res.status(404).json({
        success: false,
        error: { message: 'Request not found or you do not have permission to delete it.' }
      });
    }

    successResponse(res, { message: 'Support request deleted successfully' });
  } catch (err) {
    next(err);
  }
}



