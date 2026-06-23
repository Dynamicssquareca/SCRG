import ExcelJS from 'exceljs';
import dayjs from 'dayjs';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { Client } from '../models/Client';
import { Case } from '../models/Case';
import { Report } from '../models/Report';
import { Upload } from '../models/Upload';
import { env } from '../config/env';
import logger from '../utils/logger';

// Resolved statuses (treated as "closed" for report purposes)
const RESOLVED_STATUSES = ['resolved', 'closed'];

function isResolved(status: string): boolean {
  return RESOLVED_STATUSES.includes(String(status).toLowerCase().trim());
}

function formatDateTime(date: any): string {
  if (!date) return '';
  const d = dayjs(date);
  return d.isValid() ? d.format('DD-MM-YYYY HH:mm') : '';
}

function formatDate(date: any): string {
  if (!date) return '';
  const d = dayjs(date);
  return d.isValid() ? d.format('DD-MM-YYYY') : '';
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

function thinBorders(): Partial<ExcelJS.Borders> {
  const borderStyle: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF808080' } };
  return { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle };
}

function applyHeaderStyle(cell: ExcelJS.Cell) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A5C' } };
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = thinBorders();
}

function applyTealHeaderStyle(cell: ExcelJS.Cell) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006B7B' } };
  cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = thinBorders();
}

function applyDataCellStyle(cell: ExcelJS.Cell) {
  cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
  cell.alignment = { vertical: 'middle', wrapText: true };
  cell.border = thinBorders();
}

function applyLabelStyle(cell: ExcelJS.Cell) {
  cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
  cell.alignment = { vertical: 'middle' };
  cell.border = thinBorders();
}

function applyValueStyle(cell: ExcelJS.Cell) {
  cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
  cell.alignment = { vertical: 'middle' };
  cell.border = thinBorders();
}

interface ClientReportData {
  clientInfo: any;
  openCases: any[];
  resolvedCases: any[];
  summary: {
    totalOpened: number;
    totalClosed: number;
    pending: number;
    reopened: number;
    highPriority: number;
  };
  hoursDetails: {
    totalContracted: number;
    previousBalance: number;
    hoursConsumed: number;
    hoursOnOpen: number;
    currentBalance: number;
  };
}

async function getClientReportData(clientId: string, uploadId: string, month: number, year: number): Promise<ClientReportData> {
  const clientInfo = await Client.findById(clientId);

  // Get all cases for this client in this upload context
  const allCases = await Case.find({ client_id: clientId, upload_id: uploadId });

  // Filter cases relevant to this month
  const relevantCases = allCases.filter((c: any) => {
    // If the record has no created_on date, we arguably shouldn't include it in a monthly report
    // unless it was updated this month. 
    const createdD = c.created_on ? dayjs(c.created_on) : null;
    const updatedD = c.updated_on ? dayjs(c.updated_on) : null;

    const createdInMonth = createdD && createdD.month() + 1 === month && createdD.year() === year;
    const updatedInMonth = updatedD && updatedD.month() + 1 === month && updatedD.year() === year;

    // A case is relevant if:
    // 1. It was created in the requested month.
    // 2. OR it is still open in the requested month (created BEFORE or IN the month, and not resolved BEFORE the month).
    // 3. OR it was resolved/updated IN the requested month.

    // Check if created before or during the target month
    let createdBeforeOrDuring = false;
    if (createdD) {
      if (createdD.year() < year || (createdD.year() === year && createdD.month() + 1 <= month)) {
        createdBeforeOrDuring = true;
      }
    }

    // Check if resolved before the target month
    let resolvedBefore = false;
    if (isResolved(c.status_reason) && updatedD) {
      if (updatedD.year() < year || (updatedD.year() === year && updatedD.month() + 1 < month)) {
        resolvedBefore = true;
      }
    }

    const isOpenDuringMonth = createdBeforeOrDuring && !resolvedBefore;

    return createdInMonth || updatedInMonth || isOpenDuringMonth;
  });

  // Open cases: not resolved/closed
  const openCases = relevantCases.filter((c: any) => !isResolved(c.status_reason));

  // Resolved cases: resolved/closed in selected month
  const resolvedCases = relevantCases.filter((c: any) => {
    if (!isResolved(c.status_reason)) return false;
    const updatedD = c.updated_on ? dayjs(c.updated_on) : null;
    return updatedD && updatedD.month() + 1 === month && updatedD.year() === year;
  });

  // Ticket counts for cases created this month
  const casesCreatedThisMonth = relevantCases.filter((c: any) => {
    const createdD = c.created_on ? dayjs(c.created_on) : null;
    return createdD && createdD.month() + 1 === month && createdD.year() === year;
  });

  const totalOpened = casesCreatedThisMonth.length;
  const totalClosed = resolvedCases.length;
  const pending = openCases.length;
  const reopened = relevantCases.filter((c: any) => String(c.status_reason).toLowerCase().trim() === 'reopened').length;
  const highPriority = relevantCases.filter((c: any) => String(c.priority).toLowerCase().includes('high')).length;

  const hoursConsumed = resolvedCases.reduce((sum: number, c: any) => sum + (Number(c.billable_duration) || 0), 0);
  const hoursOnOpen = openCases.reduce((sum: number, c: any) => sum + (Number(c.billable_duration) || 0), 0);

  const totalContracted = Number(clientInfo?.total_contracted_hours) || 0;

  // Get previous month's report to get the starting balance
  const prevMonthIdx = month - 2;
  const prevMonthNum = prevMonthIdx < 0 ? 12 : prevMonthIdx + 1;
  const prevYearNum = prevMonthIdx < 0 ? year - 1 : year;

  const prevReport = await Report.findOne({ client_id: clientId, month: prevMonthNum, year: prevYearNum });
  const previousBalance = prevReport ? prevReport.remaining_balance : (Number(clientInfo?.previous_balance_hours) || 0);

  // According to standard user request: Current Balance = Previous Balance - Hours Consumed
  const currentBalance = previousBalance - hoursConsumed;

  return {
    clientInfo,
    openCases,
    resolvedCases,
    summary: { totalOpened, totalClosed, pending, reopened, highPriority },
    hoursDetails: { totalContracted, previousBalance, hoursConsumed, hoursOnOpen, currentBalance },
  };
}

function buildOverviewSheet(workbook: ExcelJS.Workbook, data: ClientReportData) {
  const ws = workbook.addWorksheet('Overview');

  ws.columns = [
    { width: 32 }, // A
    { width: 25 }, // B
    { width: 5 },  // C spacer
    { width: 32 }, // D
    { width: 25 }, // E
    { width: 5 },  // F spacer
    { width: 40 }, // G
  ];

  // Account Details Header
  ws.mergeCells('A1:B1');
  ws.getCell('A1').value = 'Account Details';
  applyHeaderStyle(ws.getCell('A1'));
  applyHeaderStyle(ws.getCell('B1'));

  const accountLabels = [
    ['Client Name', data.clientInfo?.client_name || ''],
    ['Account Manager', data.clientInfo?.account_manager || ''],
    ['Customer Success Manager', data.clientInfo?.customer_success_mgr || ''],
    ['Solution', data.clientInfo?.tool_version || ''],
    ['Start Date', formatDate(data.clientInfo?.contract_start_date)],
    ['End Date', formatDate(data.clientInfo?.contract_end_date)],
  ];

  accountLabels.forEach(([label, value], i) => {
    const row = i + 2;
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`B${row}`).value = value;

    if (label === 'Client Name') {
      // Bold red styling for Client Name row
      ws.getCell(`A${row}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFCC0000' } };
      ws.getCell(`A${row}`).alignment = { vertical: 'middle' };
      ws.getCell(`A${row}`).border = thinBorders();
      ws.getCell(`B${row}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFCC0000' } };
      ws.getCell(`B${row}`).alignment = { vertical: 'middle' };
      ws.getCell(`B${row}`).border = thinBorders();
    } else {
      applyLabelStyle(ws.getCell(`A${row}`));
      applyValueStyle(ws.getCell(`B${row}`));
    }
  });

  // Hours Details Header
  ws.mergeCells('D1:E1');
  ws.getCell('D1').value = 'Hours Details';
  applyHeaderStyle(ws.getCell('D1'));
  applyHeaderStyle(ws.getCell('E1'));

  const hoursLabels = [
    ['Total Contracted Hours', data.hoursDetails.totalContracted],
    ['Previous Balance Hours', data.hoursDetails.previousBalance],
    ['Hours Consumed This Month', data.hoursDetails.hoursConsumed],
    ['Hours alloted to open tickets', data.hoursDetails.hoursOnOpen],
    ['Current Balance Hours', data.hoursDetails.currentBalance],
  ];

  hoursLabels.forEach(([label, value], i) => {
    const row = i + 2;
    ws.getCell(`D${row}`).value = label as string;
    applyLabelStyle(ws.getCell(`D${row}`));
    ws.getCell(`E${row}`).value = value as number;
    // Center-align numeric values in Hours Details
    ws.getCell(`E${row}`).font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
    ws.getCell(`E${row}`).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(`E${row}`).border = thinBorders();
  });

  // Ticket Summary Header
  ws.mergeCells('A9:B9');
  ws.getCell('A9').value = 'Ticket Summary (Monthly)';
  applyHeaderStyle(ws.getCell('A9'));
  applyHeaderStyle(ws.getCell('B9'));

  const summaryLabels = [
    ['Total Tickets Opened', data.summary.totalOpened],
    ['Total Tickets Closed', data.summary.totalClosed],
    ['Tickets Pending', data.summary.pending],
    ['Reopened Tickets', data.summary.reopened],
    ['High Priority Tickets', data.summary.highPriority],
  ];

  summaryLabels.forEach(([label, value], i) => {
    const row = i + 10;
    ws.getCell(`A${row}`).value = label as string;
    applyLabelStyle(ws.getCell(`A${row}`));
    ws.getCell(`B${row}`).value = value as number;
    // Center-align numeric values in Ticket Summary
    ws.getCell(`B${row}`).font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
    ws.getCell(`B${row}`).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(`B${row}`).border = thinBorders();
  });

  // Feedback link
  //ws.getCell('D11').value = 'If you have any feedback please click on this link';
  //ws.getCell('D11').font = { name: 'Calibri', size: 10, color: { argb: 'FFCC0000' } };

  if (data.clientInfo?.feedback_link) {
    ws.getCell('D13').value = { text: 'Feedback Link', hyperlink: data.clientInfo.feedback_link };
    ws.getCell('D13').font = { name: 'Calibri', size: 10, color: { argb: 'FF0066CC' }, underline: true };
  }
}

function buildOpenCaseSheet(workbook: ExcelJS.Workbook, openCases: any[]) {
  const ws = workbook.addWorksheet('OPEN TICKETS REPORT');

  ws.columns = [
    { width: 8 },  // A S.No
    { width: 22 }, // B Case Number
    { width: 20 }, // C Contact
    { width: 50 }, // D Subject
    { width: 22 }, // E Created On
    { width: 10 }, // F Hours
    { width: 22 }, // G Consultant
    { width: 15 }, // H Status
  ];

  // Title
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = 'OPEN TICKETS REPORT';
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  applyTealHeaderStyle(ws.getCell('A1'));

  // Column Headers
  const headers = ['S.No.', 'CASE NUMBER', 'CONTACT', 'SUBJECT', 'CREATED ON', 'HOURS', 'CONSULTANT ASS.', 'STATUS'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = h;
    applyTealHeaderStyle(cell);
  });

  // Data rows
  openCases.forEach((caseItem: any, index: number) => {
    const row = index + 3;
    ws.getCell(row, 1).value = index + 1;
    ws.getCell(row, 2).value = caseItem.case_number;
    ws.getCell(row, 3).value = caseItem.contact;
    ws.getCell(row, 4).value = caseItem.case_title; // This is the SUBJECT column
    ws.getCell(row, 5).value = formatDate(caseItem.created_on);
    ws.getCell(row, 6).value = Number(caseItem.billable_duration) || 0;
    ws.getCell(row, 7).value = caseItem.support_agent;
    ws.getCell(row, 8).value = caseItem.status_reason;

    for (let col = 1; col <= 8; col++) {
      applyDataCellStyle(ws.getCell(row, col));
    }
    // Center-align S.No. and HOURS columns
    ws.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(row, 6).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getCell(row, 6).numFmt = '0.00';
  });
}

function buildResolvedCaseSheet(workbook: ExcelJS.Workbook, resolvedCases: any[]) {
  const ws = workbook.addWorksheet('RESOLVED TICKETS REPORT');

  ws.columns = [
    { width: 8 },  // A S.No
    { width: 22 }, // B Case Number
    { width: 20 }, // C Contact
    { width: 50 }, // D Subject
    { width: 22 }, // E Created On
    { width: 22 }, // F Resolved On
    { width: 22 }, // G Consultant
    { width: 10 }, // H Hours
  ];

  // Title
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = 'RESOLVED TICKETS REPORT';
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  applyTealHeaderStyle(ws.getCell('A1'));

  // Column Headers
  const headers = ['S.No.', 'CASE NUMBER', 'CONTACT', 'SUBJECT', 'CREATED ON', 'RESOLVED ON', 'CONSULTANT ASS.', 'HOURS'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = h;
    applyTealHeaderStyle(cell);
  });

  // Data rows
  resolvedCases.forEach((caseItem: any, index: number) => {
    const row = index + 3;
    ws.getCell(row, 1).value = index + 1;
    ws.getCell(row, 2).value = caseItem.case_number;
    ws.getCell(row, 3).value = caseItem.contact;
    ws.getCell(row, 4).value = caseItem.case_title;
    ws.getCell(row, 5).value = formatDate(caseItem.created_on);
    ws.getCell(row, 6).value = formatDate(caseItem.updated_on);
    ws.getCell(row, 7).value = caseItem.support_agent;
    ws.getCell(row, 8).value = Number(caseItem.billable_duration) || 0;

    for (let col = 1; col <= 8; col++) {
      applyDataCellStyle(ws.getCell(row, col));
    }
    // Center-align S.No. and HOURS columns
    ws.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(row, 8).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getCell(row, 8).numFmt = '0.00';
  });
}

export async function generateAllReports(uploadId: string, month: number, year: number, userId: string) {
  // Get unique clients from this upload using distinct
  const clientIds = await Case.distinct('client_id', { upload_id: uploadId, client_id: { $ne: null } });

  const results: any[] = [];
  const errors: any[] = [];

  // Get sync status from upload record
  const upload = await Upload.findById(uploadId);
  const isSyncReport = upload?.sync_client_master === true;

  for (const client_id of clientIds) {
    try {
      const reportData = await getClientReportData(client_id, uploadId, month, year);

      // Skip if no relevant cases
      if (reportData.openCases.length === 0 && reportData.resolvedCases.length === 0) {
        continue;
      }

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Dynamics Square';
      workbook.created = new Date();

      // Build sheets
      buildOverviewSheet(workbook, reportData);
      buildOpenCaseSheet(workbook, reportData.openCases);
      buildResolvedCaseSheet(workbook, reportData.resolvedCases);

      // Save file - generate buffer first for MongoDB storage
      const sanitizedName = sanitizeFileName(reportData.clientInfo.client_name);
      const monthName = dayjs().month(month - 1).format('MMM');
      const fileName = `${sanitizedName}_Support_Report_${monthName}${year}.xlsx`;

      // Generate Excel buffer
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

      // Also save to disk for local development
      let filePath: string | null = null;
      try {
        const dirPath = path.join(env.REPORT_DIR, String(year), String(month));
        fs.mkdirSync(dirPath, { recursive: true });
        filePath = path.join(dirPath, fileName);
        fs.writeFileSync(filePath, buffer);
      } catch (diskErr) {
        logger.warn(`Could not save report to disk (expected on Vercel): ${(diskErr as Error).message}`);
      }

      // Delete existing report for same client/month/year if exists
      await Report.findOneAndDelete({ client_id, month, year });

      // Save to database (including file buffer)
      const report = await Report.create({
        client_id: new mongoose.Types.ObjectId(client_id),
        upload_id: new mongoose.Types.ObjectId(uploadId),
        month,
        year,
        file_name: fileName,
        file_path: filePath,
        file_data: buffer,
        file_size_bytes: buffer.length,
        tickets_opened: reportData.summary.totalOpened,
        tickets_closed: reportData.summary.totalClosed,
        tickets_pending: reportData.summary.pending,
        hours_consumed: reportData.hoursDetails.hoursConsumed,
        remaining_balance: reportData.hoursDetails.currentBalance,
        is_sync_report: isSyncReport, // Use the sync status from the upload
        generated_by: userId ? new mongoose.Types.ObjectId(userId) : null,
      });

      results.push({
        reportId: (report._id as mongoose.Types.ObjectId).toString(),
        clientName: reportData.clientInfo.client_name,
        fileName,
        status: 'generated',
      });

      // Update client's previous balance ONLY IF this is a sync upload
      if (isSyncReport) {
        await Client.findByIdAndUpdate(client_id, {
          previous_balance_hours: reportData.hoursDetails.currentBalance,
        });
      }

      logger.info(`Generated report for ${reportData.clientInfo.client_name}`);
    } catch (err) {
      logger.error(`Error generating report for client ${client_id}: ${(err as Error).message}`);
      errors.push({ clientId: client_id, error: (err as Error).message });
    }
  }

  return { totalClients: clientIds.length, reports: results, errors };
}

