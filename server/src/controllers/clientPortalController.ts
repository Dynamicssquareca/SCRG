import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
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
export async function getClientDashboardDataHelper(clientId: string, m: number, y: number, allTime = false) {
  const clientInfo = await Client.findById(clientId);
  if (!clientInfo) throw new NotFoundError('Client not found');

  // Get all cases for this client
  const allCases = await Case.find({ client_id: clientId });

  let openCases: any[];
  let resolvedCases: any[];
  let totalOpened: number;

  if (allTime) {
    // All-time mode: no month filtering
    openCases = allCases.filter((c: any) => !isResolved(c.status_reason || ''));
    resolvedCases = allCases.filter((c: any) => isResolved(c.status_reason || ''));
    totalOpened = allCases.length;
  } else {
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
    openCases = relevantCases.filter((c: any) => !isResolved(c.status_reason || ''));

    // Resolved cases: resolved/closed during selected month
    resolvedCases = relevantCases.filter((c: any) => {
      if (!isResolved(c.status_reason || '')) return false;
      const updatedD = c.updated_on ? dayjs(c.updated_on) : null;
      return updatedD && updatedD.month() + 1 === m && updatedD.year() === y;
    });

    // Ticket counts for cases created this month
    const casesCreatedThisMonth = relevantCases.filter((c: any) => {
      const createdD = c.created_on ? dayjs(c.created_on) : null;
      return createdD && createdD.month() + 1 === m && createdD.year() === y;
    });

    totalOpened = casesCreatedThisMonth.length;
  }

  const totalClosed = resolvedCases.length;
  const pending = openCases.length;

  // hoursConsumed     = billable hours on cases CLOSED during the selected month
  // hoursOnOpen       = billable hours on all currently OPEN tickets (informational)
  // previousBalance   = dynamically computed: Contracted − hours consumed on cases closed BEFORE this month
  //                     (does NOT rely on stored Report documents which may have stale/buggy values)
  // currentBalance    = previousBalance − hoursConsumed (this month only)
  //                     Open ticket hours shown informational — NOT deducted from monthly balance.
  // All-time balance  = Contracted − consumed (all closed) − allotted (all open)

  const hoursConsumed = resolvedCases.reduce((sum: number, c: any) => sum + (Number(c.billable_duration) || 0), 0);
  const hoursOnOpen   = openCases.reduce((sum: number, c: any) => sum + (Number(c.billable_duration) || 0), 0);

  const totalContracted = Number(clientInfo.total_contracted_hours) || 0;

  // Dynamic previous balance: Contracted − hours consumed on ALL cases closed BEFORE this month's start.
  // This is always correct even if stored Report documents have wrong/stale remaining_balance values.
  let previousBalance: number;
  if (allTime) {
    // All-time mode: "starting balance" = total contracted (the baseline)
    previousBalance = totalContracted;
  } else {
    const monthStart = new Date(y, m - 1, 1); // 1st day of selected month
    const hoursConsumedBeforeThisMonth = allCases
      .filter((c: any) => {
        if (!isResolved(c.status_reason || '')) return false;
        const updatedD = c.updated_on ? new Date(c.updated_on) : null;
        return updatedD && updatedD < monthStart;
      })
      .reduce((sum: number, c: any) => sum + (Number(c.billable_duration) || 0), 0);
    previousBalance = totalContracted - hoursConsumedBeforeThisMonth;
  }

  const currentBalance = allTime
    ? totalContracted - hoursConsumed - hoursOnOpen   // all-time: contracted − closed − open
    : previousBalance - hoursConsumed;                // monthly:  prev balance − this month's closed

  // Check if a generated report file exists for download (month-specific only)
  const report = allTime ? null : await Report.findOne({ client_id: clientId, month: m, year: y, file_data: { $ne: null } });

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
      // In All-Time mode, base balance on totalContracted; previousBalance not meaningful cross-period
      previousBalance: allTime ? totalContracted : previousBalance,
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
    allTime,
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

    const { month, year, allTime } = req.query;
    const isAllTime = allTime === 'true';
    const m = month ? Number(month) : dayjs().month() + 1;
    const y = year ? Number(year) : dayjs().year();

    const data = await getClientDashboardDataHelper(clientId, m, y, isAllTime);
    successResponse(res, data);
  } catch (err) { next(err); }
}

/**
 * GET /admin/client-dashboard-preview?clientId=X&month=M&year=Y
 * Admin-only: returns the full dashboard data for any client, for preview purposes.
 */
export async function getClientDashboardPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const { clientId, month, year, allTime } = req.query;
    if (!clientId) throw new ForbiddenError('clientId query parameter is required');

    const isAllTime = allTime === 'true';
    const m = month ? Number(month) : dayjs().month() + 1;
    const y = year ? Number(year) : dayjs().year();

    const data = await getClientDashboardDataHelper(String(clientId), m, y, isAllTime);
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

    const { month, year, format, allTime } = req.query;
    const isAllTime = allTime === 'true';
    const m = month ? Number(month) : dayjs().month() + 1;
    const y = year ? Number(year) : dayjs().year();

    if (format === 'pdf') {
      const data = await getClientDashboardDataHelper(clientId, m, y, isAllTime);
      const monthStart = new Date(y, m - 1, 1);
      const monthName = isAllTime ? 'All_Time' : dayjs(monthStart).format('MMMM');

      const pdfData: ClientPortalPdfData = {
        month: isAllTime ? 0 : m,
        year: y,
        monthName: isAllTime ? 'All Time' : monthName,
        clientInfo: data.clientInfo,
        hoursDetails: data.hoursDetails,
        ticketSummary: data.ticketSummary,
        openCases: data.openCases,
        resolvedCases: data.resolvedCases,
      };

      const pdfBuffer = await generateClientPortalPdf(pdfData);

      const cleanClientName = data.clientInfo.client_name.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = isAllTime
        ? `Support_Report_${cleanClientName}_All_Time.pdf`
        : `Support_Report_${cleanClientName}_${monthName.substring(0, 3)}_${y}.pdf`;

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      });
      return res.send(pdfBuffer);
    }

    // For All-Time Excel: dynamically generate a styled workbook with ExcelJS
    if (isAllTime) {
      const data = await getClientDashboardDataHelper(clientId, m, y, true);
      const cleanClientName = data.clientInfo.client_name.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Support_Report_${cleanClientName}_All_Time.xlsx`;

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Dynamics Square Support Portal';
      wb.created = new Date();

      // ── Shared style helpers ─────────────────────────────────────────────
      const COLORS = {
        // section header backgrounds
        acctHeader:     '1B6B3A',   // deep green  – Account Details
        hoursHeader:    '1B4F8A',   // deep blue   – Hours Summary
        ticketHeader:   '7B3F00',   // dark brown  – Ticket Summary
        openHeader:     '1B4F8A',   // blue        – Open Tickets sheet header
        resolvedHeader: '1B6B3A',   // green       – Resolved Tickets sheet header
        // data rows
        labelFill:      'F2F2F2',   // light gray for label cells
        zebraFill:      'EAF4FB',   // very light blue alternate row
        balancePos:     'E8F5E9',   // light green – positive balance
        balanceNeg:     'FFEBEE',   // light red   – negative balance
        balancePosFont: '1B6B3A',
        balanceNegFont: 'C62828',
        white:          'FFFFFF',
        black:          '1A1A1A',
      };

      const thinBorder: Partial<ExcelJS.Borders> = {
        top:    { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left:   { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right:  { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };

      const sectionHeaderStyle = (bgHex: string): Partial<ExcelJS.Style> => ({
        font:      { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
        fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${bgHex}` } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border:    thinBorder,
      });

      const labelStyle = (zebra = false): Partial<ExcelJS.Style> => ({
        font:      { bold: true, color: { argb: `FF${COLORS.black}` }, size: 9 },
        fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: zebra ? `FF${COLORS.zebraFill}` : `FF${COLORS.white}` } },
        alignment: { horizontal: 'left', vertical: 'middle' },
        border:    thinBorder,
      });

      const valueStyle = (zebra = false): Partial<ExcelJS.Style> => ({
        font:      { color: { argb: `FF${COLORS.black}` }, size: 9 },
        fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: zebra ? `FF${COLORS.zebraFill}` : `FF${COLORS.white}` } },
        alignment: { horizontal: 'right', vertical: 'middle' },
        border:    thinBorder,
      });

      // ── SHEET 1: SUMMARY ────────────────────────────────────────────────
      // Layout: cols A-B = Account Details | D-E = Hours Summary | G-H = Ticket Summary
      const ws = wb.addWorksheet('Summary');

      // Column widths
      ws.columns = [
        { key: 'A', width: 28 },  // A – Account labels
        { key: 'B', width: 22 },  // B – Account values
        { key: 'C', width: 3  },  // C – spacer
        { key: 'D', width: 30 },  // D – Hours labels
        { key: 'E', width: 14 },  // E – Hours values
        { key: 'F', width: 3  },  // F – spacer
        { key: 'G', width: 20 },  // G – Ticket labels
        { key: 'H', width: 14 },  // H – Ticket values
      ];

      // Row 1 – section header row
      const headerRow = ws.getRow(1);
      headerRow.height = 22;

      const acctHeaderCell  = ws.getCell('A1');
      const hoursHeaderCell = ws.getCell('D1');
      const ticketHeaderCell = ws.getCell('G1');

      acctHeaderCell.value  = 'Account Details';
      hoursHeaderCell.value = 'Hours Summary';
      ticketHeaderCell.value = 'Ticket Summary';

      Object.assign(acctHeaderCell,  { style: sectionHeaderStyle(COLORS.acctHeader)  });
      Object.assign(hoursHeaderCell, { style: sectionHeaderStyle(COLORS.hoursHeader) });
      Object.assign(ticketHeaderCell, { style: sectionHeaderStyle(COLORS.ticketHeader) });

      // Merge header cells across the two data columns in each panel
      ws.mergeCells('A1:B1');
      ws.mergeCells('D1:E1');
      ws.mergeCells('G1:H1');

      // ── Account Details rows (A-B, rows 2..5) ─────────────────────────
      const accountData: [string, string][] = [
        ['Client',                   data.clientInfo.client_name          || '-'],
        ['Account Manager',          data.clientInfo.account_manager      || '-'],
        ['Customer Success Manager', data.clientInfo.customer_success_mgr || '-'],
        ['Solution',                 data.clientInfo.tool_version         || '-'],
      ];
      accountData.forEach(([label, value], i) => {
        const row = i + 2;
        const zebra = i % 2 === 1;
        const lCell = ws.getCell(`A${row}`);
        const vCell = ws.getCell(`B${row}`);
        lCell.value = label;  Object.assign(lCell, { style: labelStyle(zebra) });
        vCell.value = value;  Object.assign(vCell, { style: { ...valueStyle(zebra), alignment: { horizontal: 'left', vertical: 'middle' } } });
        ws.getRow(row).height = 18;
      });

      // ── Hours Summary rows (D-E, rows 2..6) ───────────────────────────
      const hoursData: [string, number | string][] = [
        ['Total Contracted Hours',           data.hoursDetails.totalContracted],
        ['Hours Consumed (Closed Tickets)',   data.hoursDetails.hoursConsumed],
        ['Hours Allotted to Open Tickets',   data.hoursDetails.hoursOnOpen],
        ['Current Balance Hours',            data.hoursDetails.currentBalance],
      ];
      hoursData.forEach(([label, value], i) => {
        const row = i + 2;
        const zebra = i % 2 === 1;
        const isBalance = label === 'Current Balance Hours';
        const isNeg = isBalance && Number(value) < 0;
        const lCell = ws.getCell(`D${row}`);
        const vCell = ws.getCell(`E${row}`);

        const bgArgb = isBalance
          ? (isNeg ? `FF${COLORS.balanceNeg}` : `FF${COLORS.balancePos}`)
          : (zebra ? `FF${COLORS.zebraFill}` : `FF${COLORS.white}`);
        const fontArgb = isBalance
          ? (isNeg ? `FF${COLORS.balanceNegFont}` : `FF${COLORS.balancePosFont}`)
          : `FF${COLORS.black}`;

        lCell.value = label;
        Object.assign(lCell, {
          style: {
            font:      { bold: isBalance, color: { argb: fontArgb }, size: 9 },
            fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } },
            alignment: { horizontal: 'left', vertical: 'middle' },
            border:    thinBorder,
          },
        });

        vCell.value = Number(value);
        vCell.numFmt = '0.00';
        Object.assign(vCell, {
          style: {
            font:      { bold: isBalance, color: { argb: fontArgb }, size: 9 },
            fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } },
            alignment: { horizontal: 'right', vertical: 'middle' },
            border:    thinBorder,
          },
        });
        ws.getRow(row).height = 18;
      });

      // ── Ticket Summary rows (G-H, rows 2..4) ──────────────────────────
      const ticketData: [string, number][] = [
        ['Total Tickets',   data.ticketSummary.totalOpened],
        ['Total Resolved',  data.ticketSummary.totalClosed],
        ['Pending',         data.ticketSummary.pending],
      ];
      ticketData.forEach(([label, value], i) => {
        const row = i + 2;
        const zebra = i % 2 === 1;
        const lCell = ws.getCell(`G${row}`);
        const vCell = ws.getCell(`H${row}`);
        lCell.value = label;  Object.assign(lCell, { style: labelStyle(zebra) });
        vCell.value = value;  Object.assign(vCell, { style: valueStyle(zebra) });
        ws.getRow(row).height = 18;
      });

      // ── SHEET 2: OPEN TICKETS ────────────────────────────────────────
      const wsOpen = wb.addWorksheet('Open Tickets');
      const openHeaders = ['S.No.', 'Case Number', 'Contact', 'Subject', 'Created On', 'Hours', 'Consultant', 'Status'];
      wsOpen.columns = [
        { key: 'sno',       width: 7  },
        { key: 'caseNo',    width: 18 },
        { key: 'contact',   width: 22 },
        { key: 'subject',   width: 38 },
        { key: 'createdOn', width: 14 },
        { key: 'hours',     width: 10 },
        { key: 'consultant',width: 22 },
        { key: 'status',    width: 18 },
      ];

      const openHeaderRow = wsOpen.addRow(openHeaders);
      openHeaderRow.height = 20;
      openHeaderRow.eachCell((cell) => {
        Object.assign(cell, { style: sectionHeaderStyle(COLORS.openHeader) });
      });

      if (data.openCases.length === 0) {
        wsOpen.addRow(['No open tickets']);
      } else {
        data.openCases.forEach((c: any, i: number) => {
          const zebra = i % 2 === 1;
          const row = wsOpen.addRow([
            c.sno,
            c.case_number,
            c.contact,
            c.subject,
            c.created_on ? dayjs(c.created_on).format('DD-MM-YYYY') : '-',
            c.hours,
            c.consultant,
            c.status,
          ]);
          row.height = 17;
          row.eachCell((cell, col) => {
            const isNum = col === 1 || col === 6;
            Object.assign(cell, {
              style: {
                font:      { size: 9, color: { argb: `FF${COLORS.black}` } },
                fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: zebra ? `FF${COLORS.zebraFill}` : `FF${COLORS.white}` } },
                alignment: { horizontal: isNum ? 'center' : 'left', vertical: 'middle', wrapText: col === 4 },
                border:    thinBorder,
              },
            });
          });
        });

        // Totals row
        const totalHrsOpen = data.openCases.reduce((s: number, c: any) => s + c.hours, 0);
        const totRowOpen = wsOpen.addRow(['', 'TOTAL', '', '', '', totalHrsOpen, '', '']);
        totRowOpen.height = 18;
        totRowOpen.eachCell((cell, col) => {
          Object.assign(cell, {
            style: {
              font:      { bold: true, size: 9, color: { argb: 'FFFFFFFF' } },
              fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.openHeader}` } },
              alignment: { horizontal: col === 6 ? 'center' : 'left', vertical: 'middle' },
              border:    thinBorder,
            },
          });
        });
      }

      // ── SHEET 3: RESOLVED TICKETS ────────────────────────────────────
      const wsResolved = wb.addWorksheet('Resolved Tickets');
      const resolvedHeaders = ['S.No.', 'Case Number', 'Contact', 'Subject', 'Created On', 'Resolved On', 'Hours', 'Consultant'];
      wsResolved.columns = [
        { key: 'sno',        width: 7  },
        { key: 'caseNo',     width: 18 },
        { key: 'contact',    width: 22 },
        { key: 'subject',    width: 38 },
        { key: 'createdOn',  width: 14 },
        { key: 'resolvedOn', width: 14 },
        { key: 'hours',      width: 10 },
        { key: 'consultant', width: 22 },
      ];

      const resolvedHeaderRow = wsResolved.addRow(resolvedHeaders);
      resolvedHeaderRow.height = 20;
      resolvedHeaderRow.eachCell((cell) => {
        Object.assign(cell, { style: sectionHeaderStyle(COLORS.resolvedHeader) });
      });

      if (data.resolvedCases.length === 0) {
        wsResolved.addRow(['No resolved tickets']);
      } else {
        data.resolvedCases.forEach((c: any, i: number) => {
          const zebra = i % 2 === 1;
          const row = wsResolved.addRow([
            c.sno,
            c.case_number,
            c.contact,
            c.subject,
            c.created_on  ? dayjs(c.created_on).format('DD-MM-YYYY')  : '-',
            c.resolved_on ? dayjs(c.resolved_on).format('DD-MM-YYYY') : '-',
            c.hours,
            c.consultant,
          ]);
          row.height = 17;
          row.eachCell((cell, col) => {
            const isNum = col === 1 || col === 7;
            Object.assign(cell, {
              style: {
                font:      { size: 9, color: { argb: `FF${COLORS.black}` } },
                fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: zebra ? `FF${COLORS.zebraFill}` : `FF${COLORS.white}` } },
                alignment: { horizontal: isNum ? 'center' : 'left', vertical: 'middle', wrapText: col === 4 },
                border:    thinBorder,
              },
            });
          });
        });

        // Totals row
        const totalHrsResolved = data.resolvedCases.reduce((s: number, c: any) => s + c.hours, 0);
        const totRowRes = wsResolved.addRow(['', 'TOTAL', '', '', '', '', totalHrsResolved, '']);
        totRowRes.height = 18;
        totRowRes.eachCell((cell, col) => {
          Object.assign(cell, {
            style: {
              font:      { bold: true, size: 9, color: { argb: 'FFFFFFFF' } },
              fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.resolvedHeader}` } },
              alignment: { horizontal: col === 7 ? 'center' : 'left', vertical: 'middle' },
              border:    thinBorder,
            },
          });
        });
      }

      // ── Stream workbook to buffer and send ───────────────────────────
      const excelBuffer = await wb.xlsx.writeBuffer();

      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(excelBuffer.byteLength),
      });
      return res.send(Buffer.from(excelBuffer));
    }

    // For month-specific Excel: use stored report file
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



