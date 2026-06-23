import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import mongoose from 'mongoose';
import { Upload } from '../models/Upload';
import { Client } from '../models/Client';
import { Case } from '../models/Case';
import { Report } from '../models/Report';
import { ValidationError } from '../utils/apiResponse';
import logger from '../utils/logger';

dayjs.extend(customParseFormat);

const REQUIRED_COLUMNS = [
  'Case Number',
  'Customer Name (Customer) (Account)',
  'Contact',
  'Created On',
  'Case Title',
  'Support Agent',
  'Status Reason',
  'Priority',
  'Country (Customer) (Account)',
  'Billable Duration',
  'Updated On',
  'Total Days',
  'Comments',
];

interface ProcessedRow {
  caseNumber: string;
  customerName: string;
  contact: string;
  createdOn: string | null;
  caseTitle: string;
  supportAgent: string;
  statusReason: string;
  priority: string;
  country: string;
  billableDuration: number;
  updatedOn: string | null;
  totalDays: number;
  comments: string;
}

function findColumn(headers: string[], target: string): string | undefined {
  const targetLower = target.toLowerCase().trim();
  return headers.find((h) => h.toLowerCase().trim() === targetLower);
}

function parseDate(value: any): string | null {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;

  // Try numeric Excel serial date
  const num = Number(str);
  if (!isNaN(num) && num > 0 && num < 200000) {
    const excelDate = XLSX.SSF.parse_date_code(num);
    if (excelDate) {
      // Create date in UTC to avoid timezone offset issues
      const utcDate = new Date(Date.UTC(
        excelDate.y, 
        excelDate.m - 1, 
        excelDate.d, 
        excelDate.H || 0, 
        excelDate.M || 0, 
        excelDate.S || 0
      ));
      return utcDate.toISOString();
    }
  }

  // Try multiple formats
  const formats = [
    'M/D/YY',
    'M/D/YYYY',
    'MM/DD/YYYY',
    'DD-MM-YYYY HH:mm',
    'DD/MM/YYYY HH:mm',
    'YYYY-MM-DD HH:mm:ss',
    'YYYY-MM-DD',
    'MM-DD-YYYY HH:mm',
    'DD-MM-YYYY HH:mm:ss',
    'M/D/YY H:mm',
  ];

  for (const fmt of formats) {
    const d = dayjs(str, fmt, true);
    if (d.isValid()) {
      let year = d.year();
      if (year < 100) year += 2000;
      // Convert dayjs object to UTC ISO string to avoid timezone offset issues
      return dayjs(d).year(year).utc().toISOString();
    }
  }

  // Parse as UTC to maintain consistency
  const nativeDate = new Date(str);
  if (!isNaN(nativeDate.getTime())) {
    return nativeDate.toISOString();
  }

  return null;
}

function parseDuration(value: any): number {
  if (!value) return 0;
  // Handle formula-like strings like "51.75 + 10" if they appear in duration
  const str = String(value).trim();
  if (str.includes('+') || str.includes('-')) {
    try {
      // Basic evaluation for simple "51.75 + 10" patterns
      const parts = str.split(/([+-])/);
      let total = 0;
      let currentOp = '+';
      for (const part of parts) {
        const p = part.trim();
        if (p === '+' || p === '-') {
          currentOp = p;
        } else if (p) {
          const val = parseFloat(p.replace(/[^0-9.]/g, ''));
          if (!isNaN(val)) {
            total = currentOp === '+' ? total + val : total - val;
          }
        }
      }
      return Math.round(total * 100) / 100;
    } catch { /* fallback to simple parse */ }
  }
  const cleanStr = str.replace(/[^0-9.\-]/g, '').trim();
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

function parseTotalDays(value: any): number {
  if (!value) return 0;
  const num = parseInt(String(value).trim(), 10);
  return isNaN(num) ? 0 : num;
}

function getMonthNumber(name: string): number | null {
  const n = name.toLowerCase().trim();
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];

  // Try exact match or starting with
  const directIdx = months.findIndex(m => n.startsWith(m) || m.startsWith(n.substring(0, 3)));
  if (directIdx !== -1) return directIdx + 1;

  // Handle common typos like "Febuary"
  if (n.includes('feb')) return 2;
  if (n.includes('sept')) return 9;

  return null;
}

export async function processFile(
  fileBuffer: Buffer,
  uploadId: string,
  month: number,
  year: number,
  syncClientMaster: boolean = false
): Promise<{ rowCount: number; clientsDetected: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  // Read from buffer instead of disk - works on Vercel and locally
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

  const clientMap: Record<string, string> = {}; // Name to ID

  if (syncClientMaster) {
    // Step 1: Sync Client Master from "Balance Hours" sheet if it exists
    const balanceSheetName = workbook.SheetNames.find(n => n.toLowerCase().trim().includes('balance hours'));
    const balanceMonths: Record<string, number> = {}; // Header name to Month number

    if (balanceSheetName) {
      const balanceSheet = workbook.Sheets[balanceSheetName];
      const balanceData = XLSX.utils.sheet_to_json(balanceSheet) as any[];
      const headers = balanceData.length > 0 ? Object.keys(balanceData[0]) : [];

      // Map headers to months
      headers.forEach(h => {
        const m = getMonthNumber(h);
        if (m) balanceMonths[h] = m;
      });

      for (const row of balanceData) {
        const name = String(row['Account Name'] || row['Client Name'] || '').trim();
        if (!name) continue;

        let client = await Client.findOne({ client_name: { $regex: new RegExp(`^${name}$`, 'i') } });
        const firstMonthHeader = Object.keys(balanceMonths)[0];
        const startBal = firstMonthHeader ? parseDuration(row[firstMonthHeader]) : 0;

        if (!client) {
          client = await Client.create({
            client_name: name,
            total_contracted_hours: startBal > 0 ? startBal : 0,
            previous_balance_hours: 0,
            is_active: true
          });
        }
        clientMap[name] = client._id.toString();

        // Seed historical Report balances from this sheet
        for (const [header, monthNum] of Object.entries(balanceMonths)) {
          // Skip future months (e.g., April when uploading March)
          if (monthNum > month && (monthNum - month) <= 6) continue;

          const bal = parseDuration(row[header]);
          // Far-past months (e.g., Dec when uploading Mar) → previous year
          const targetYear = (monthNum - month > 6) ? year - 1 : year;
          const filter = { client_id: client._id, month: monthNum, year: targetYear };
          await Report.findOneAndUpdate(filter, { 
            remaining_balance: bal, 
            status: 'draft',
            is_sync_report: true // Mark as sync report
          }, { upsert: true });
        }
      }
      logger.info(`Synced ${Object.keys(clientMap).length} clients and balances from Balance Hours sheet`);
    }

    // Step 2: Sync Historical Usage from "Hours Used Monthly" sheet if it exists
    const usageSheetName = workbook.SheetNames.find(n => n.toLowerCase().trim().includes('hours used monthly'));
    if (usageSheetName) {
      const usageData = XLSX.utils.sheet_to_json(workbook.Sheets[usageSheetName]) as any[];
      const headers = usageData.length > 0 ? Object.keys(usageData[0]) : [];

      for (const row of usageData) {
        const name = String(row['Account Name'] || row['Client Name'] || '').trim();
        if (!name) continue;

        // Fuzzy lookup for clientId in clientMap or DB
        let clientId = clientMap[name];
        if (!clientId) {
          const found = await Client.findOne({ client_name: { $regex: new RegExp(`^${name}$`, 'i') } });
          if (found) clientId = found._id.toString();
        }
        if (!clientId) continue;

        for (const header of headers) {
          const monthNum = getMonthNumber(header);
          if (!monthNum) continue;

          // Skip future months
          if (monthNum > month && (monthNum - month) <= 6) continue;

          const hours = parseDuration(row[header]);
          const targetYear = (monthNum - month > 6) ? year - 1 : year;
          const filter = { client_id: new mongoose.Types.ObjectId(clientId), month: monthNum, year: targetYear };
          await Report.findOneAndUpdate(filter, { 
            hours_consumed: hours,
            is_sync_report: true // Mark as sync report
          }, { upsert: true });
        }
      }
      logger.info(`Synced historical usage from ${usageSheetName}`);
    }
    // Clean up any stale draft reports for future months in the upload year
    // (e.g., April 2026 drafts created by previous uploads when uploading for March 2026)
    await Report.deleteMany({ month: { $gt: month }, year: year, status: 'draft' });
    logger.info(`Cleaned up draft reports for months after ${month}/${year}`);
  } // end of syncClientMaster block

  // Step 3: Determine which sheet to use for tickets
  let ticketSheetName = workbook.SheetNames.find(n => n.toLowerCase().trim().includes('all_tickets'));
  if (!ticketSheetName) ticketSheetName = workbook.SheetNames[0];

  const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[ticketSheetName!], {
    raw: false,
    defval: '',
  }) as Record<string, string>[];

  if (rawData.length === 0) {
    await Upload.findByIdAndUpdate(uploadId, { status: 'failed', error_message: 'Ticket sheet has no data' });
    throw new ValidationError('Ticket sheet has no data');
  }

  // Step 3: Validate columns and process rows
  const headers = Object.keys(rawData[0]);
  const columnMap: Record<string, string> = {};
  for (const col of REQUIRED_COLUMNS) {
    const found = findColumn(headers, col);
    if (found) columnMap[col] = found;
  }

  // Check critical columns
  if (!columnMap['Case Number'] || !columnMap['Customer Name (Customer) (Account)']) {
    throw new ValidationError('Crucial columns missing (Case Number or Customer Name)');
  }

  const processedRows: ProcessedRow[] = [];
  for (let i = 0; i < rawData.length; i++) {
    const raw = rawData[i];
    const rowNum = i + 2;

    const caseNumber = String(raw[columnMap['Case Number']] || '').trim().toUpperCase();
    if (!caseNumber) continue;

    const customerName = String(raw[columnMap['Customer Name (Customer) (Account)']] || '').trim();
    if (!customerName) continue;

    const updatedOn = parseDate(raw[columnMap['Updated On']]);
    const billableDuration = parseDuration(raw[columnMap['Billable Duration']]);

    processedRows.push({
      caseNumber,
      customerName,
      contact: String(raw[columnMap['Contact']] || '').trim(),
      createdOn: parseDate(raw[columnMap['Created On']]),
      caseTitle: String(raw[columnMap['Case Title']] || '').trim(),
      supportAgent: String(raw[columnMap['Support Agent']] || '').trim(),
      statusReason: String(raw[columnMap['Status Reason']] || '').trim(),
      priority: String(raw[columnMap['Priority']] || '').trim(),
      country: String(raw[columnMap['Country (Customer) (Account)']] || '').trim(),
      billableDuration,
      updatedOn,
      totalDays: parseTotalDays(raw[columnMap['Total Days']]),
      comments: String(raw[columnMap['Comments']] || '').trim(),
    });

    // Ensure client exists if not already in map
    if (!clientMap[customerName]) {
      let client = await Client.findOne({ client_name: { $regex: new RegExp(`^${customerName}$`, 'i') } });
      if (!client) {
        client = await Client.create({ client_name: customerName, total_contracted_hours: 0, previous_balance_hours: 0 });
        warnings.push(`Auto-created missing client: ${customerName}`);
      }
      clientMap[customerName] = client._id.toString();
    }
  }

  // Step 4: Batch insert
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const batchSize = 500;
    for (let i = 0; i < processedRows.length; i += batchSize) {
      const bulkOps = processedRows.slice(i, i + batchSize).map((row) => ({
        updateOne: {
          filter: { case_number: row.caseNumber },
          update: {
            $set: {
              upload_id: new mongoose.Types.ObjectId(uploadId),
              client_id: clientMap[row.customerName] ? new mongoose.Types.ObjectId(clientMap[row.customerName]) : null,
              customer_name: row.customerName,
              contact: row.contact,
              created_on: row.createdOn,
              case_title: row.caseTitle,
              support_agent: row.supportAgent,
              status_reason: row.statusReason,
              priority: row.priority,
              country: row.country,
              billable_duration: row.billableDuration,
              updated_on: row.updatedOn,
              total_days: row.totalDays,
              comments: row.comments,
            }
          },
          upsert: true
        }
      }));
      await Case.bulkWrite(bulkOps as any, { session });
    }

    await Upload.findByIdAndUpdate(uploadId, { 
      row_count: processedRows.length, 
      status: 'completed',
      sync_client_master: syncClientMaster 
    }, { session });
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    await Upload.findByIdAndUpdate(uploadId, { status: 'failed', error_message: (err as Error).message });
    throw err;
  } finally {
    session.endSession();
  }

  return {
    rowCount: processedRows.length,
    clientsDetected: Object.keys(clientMap),
    warnings,
  };
}

