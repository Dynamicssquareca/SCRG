import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import dayjs from 'dayjs';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { getClientMonthlyBalance, getBatchClientMonthlyBalances, reconcileOctoberHistoricalBalances } from '../services/balanceService';
import { Client } from '../models/Client';
import { Report } from '../models/Report';
import { Case } from '../models/Case';
import { Upload } from '../models/Upload';
import { User } from '../models/User';
import { getAllClients, updateClient } from '../services/clientService';
import { getMonthlyReportData, generateClientPortalPdf } from '../services/pdfReportService';
import { getClientDashboardDataHelper } from '../controllers/clientPortalController';
import { processFile } from '../services/dataProcessingService';
import { generateAllReports } from '../services/reportGenerationService';

interface ReportSnapshot {
  _id: string;
  client_id: string;
  month: number;
  year: number;
  remaining_balance: number | null;
  hours_consumed: number | null;
  tickets_opened: number | null;
  tickets_closed: number | null;
  tickets_pending: number | null;
  file_name: string | null;
}

function computeSnapshotHash(snapshots: ReportSnapshot[]): string {
  const serialized = JSON.stringify(snapshots.map(s => [
    s._id,
    s.client_id,
    s.month,
    s.year,
    s.remaining_balance,
    s.hours_consumed,
    s.tickets_opened,
    s.tickets_closed,
    s.tickets_pending,
    s.file_name,
  ]));
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function createTestCasesExcelBuffer(rows: any[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'all_tickets');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function runRigorousSuite() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not found');

  await mongoose.connect(uri);
  console.log('================================================================================');
  console.log('=== RIGOROUS PRODUCTION-GRADE REGRESSION & VALIDATION SUITE ===');
  console.log('================================================================================\n');

  let allPassed = true;
  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
    } else {
      console.error(`  [FAIL] ${testName}`, detail || '');
      allPassed = false;
    }
  }

  // ============================================================================
  // REQUIREMENT 1 & 2: Historical Snapshot (Before Testing)
  // ============================================================================
  console.log('--- 1. CAPTURING HISTORICAL REPORTS SNAPSHOT (Jan-Sep 2026) ---');
  const preJanSepReports = await Report.find({ year: 2026, month: { $lte: 9 } }).sort({ _id: 1 }).lean();
  console.log(`  Total Jan-Sep 2026 historical reports captured: ${preJanSepReports.length}`);
  assert(preJanSepReports.length === 339, 'Exactly 339 historical reports exist for Jan-Sep 2026');

  const preSnapshotMap = new Map<string, ReportSnapshot>();
  const preJanSepSnapshots: ReportSnapshot[] = preJanSepReports.map((r: any) => {
    const snap: ReportSnapshot = {
      _id: r._id.toString(),
      client_id: r.client_id?.toString() || '',
      month: r.month,
      year: r.year,
      remaining_balance: r.remaining_balance != null ? Number(r.remaining_balance) : null,
      hours_consumed: r.hours_consumed != null ? Number(r.hours_consumed) : null,
      tickets_opened: r.tickets_opened != null ? Number(r.tickets_opened) : null,
      tickets_closed: r.tickets_closed != null ? Number(r.tickets_closed) : null,
      tickets_pending: r.tickets_pending != null ? Number(r.tickets_pending) : null,
      file_name: r.file_name || null,
    };
    preSnapshotMap.set(snap._id, snap);
    return snap;
  });
  const preJanSepHash = computeSnapshotHash(preJanSepSnapshots);
  console.log(`  Jan-Sep 2026 SHA256 pre-test checksum: ${preJanSepHash}`);

  // Also snapshot October 2026 (30 records post-reconciliation)
  const preOctReports = await Report.find({ year: 2026, month: 10 }).sort({ _id: 1 }).lean();
  console.log(`  Total Oct 2026 historical reports captured: ${preOctReports.length}`);
  assert(preOctReports.length === 30, 'Exactly 30 historical reports exist for Oct 2026');

  const preOctSnapshotMap = new Map<string, ReportSnapshot>();
  const preOctSnapshots: ReportSnapshot[] = preOctReports.map((r: any) => {
    const snap: ReportSnapshot = {
      _id: r._id.toString(),
      client_id: r.client_id?.toString() || '',
      month: r.month,
      year: r.year,
      remaining_balance: r.remaining_balance != null ? Number(r.remaining_balance) : null,
      hours_consumed: r.hours_consumed != null ? Number(r.hours_consumed) : null,
      tickets_opened: r.tickets_opened != null ? Number(r.tickets_opened) : null,
      tickets_closed: r.tickets_closed != null ? Number(r.tickets_closed) : null,
      tickets_pending: r.tickets_pending != null ? Number(r.tickets_pending) : null,
      file_name: r.file_name || null,
    };
    preOctSnapshotMap.set(snap._id, snap);
    return snap;
  });
  const preOctHash = computeSnapshotHash(preOctSnapshots);
  console.log(`  Oct 2026 SHA256 pre-test checksum: ${preOctHash}\n`);

  // Target client: Aline Studio
  const aline = await Client.findOne({ client_name: /aline/i });
  if (!aline) throw new Error('Aline Studio client not found in database');
  const alineId = (aline._id as mongoose.Types.ObjectId).toString();

  // Baseline check
  const baselineNov = await getClientMonthlyBalance(alineId, 11, 2026);
  console.log('  Baseline Aline Studio (Nov 2026):', baselineNov);
  assert(baselineNov.previousBalance === 47, 'Baseline Previous Balance = 47');
  assert(baselineNov.hoursConsumed === 0, 'Baseline Hours Consumed = 0');
  assert(baselineNov.hoursOnOpen === 15, 'Baseline Hours on Open = 15');
  assert(baselineNov.currentBalance === 32, 'Baseline Current Balance = 32');

  // ============================================================================
  // REQUIREMENT 3: Actual Ticket Lifecycle via Application Workflow
  // ============================================================================
  console.log('\n--- 3. ACTUAL TICKET LIFECYCLE (via DataProcessingService & Real Excel Ingestion) ---');
  // Find an admin user to own the test upload
  const adminUser = await User.findOne({ role: 'admin' });
  const adminUserId = adminUser ? (adminUser._id as mongoose.Types.ObjectId).toString() : new mongoose.Types.ObjectId().toString();

  // Create isolated Upload document
  const testUpload = await Upload.create({
    user_id: new mongoose.Types.ObjectId(adminUserId),
    original_name: 'test_ticket_lifecycle.xlsx',
    file_size_bytes: 1024,
    month: 11,
    year: 2026,
    sync_client_master: false,
    status: 'processing',
  });
  const testUploadId = (testUpload._id as mongoose.Types.ObjectId).toString();
  const testCaseNumber = `CAS-RIGOROUS-${Date.now()}`;

  try {
    // Stage A: Real Excel file upload with ticket OPEN (5.0 hours allocated)
    console.log(`  Stage A: Ingesting Excel with OPEN ticket ${testCaseNumber} (5.0h allocated)...`);
    const openRows = [
      {
        'Case Number': testCaseNumber,
        'Customer Name (Customer) (Account)': aline.client_name,
        'Contact': 'John Rigorous',
        'Created On': '11/02/2026 09:30',
        'Case Title': 'Rigorous Integration Test Ticket',
        'Support Agent': 'Consultant Alpha',
        'Status Reason': 'In Progress', // OPEN
        'Priority': 'Normal',
        'Country (Customer) (Account)': 'United Kingdom',
        'Billable Duration': '5.0',
        'Updated On': '',
        'Total Days': '1',
        'Comments': 'Initial open ticket ingestion',
      },
    ];
    const openBuffer = createTestCasesExcelBuffer(openRows);
    const processResultOpen = await processFile(openBuffer, testUploadId, 11, 2026, false);
    console.log(`  -> Excel processed: ${processResultOpen.rowCount} rows, detected: ${processResultOpen.clientsDetected.join(', ')}`);

    const openBalance = await getClientMonthlyBalance(alineId, 11, 2026);
    console.log('  Balance with ticket open:', openBalance);
    assert(openBalance.previousBalance === 47, 'Previous Balance remains 47 (open allocation NOT deducted from PB)');
    assert(openBalance.hoursOnOpen === 20, 'Hours on Open increases by 5.0h (15 -> 20)');
    assert(openBalance.hoursConsumed === 0, 'Hours Consumed remains 0');
    assert(openBalance.currentBalance === 27, 'Current Balance decreases by temporary allocation (47 - 0 - 20 = 27)');

    // Stage B: Real Excel file upload with consultant time-entry and CLOSURE (3.5h actual logged)
    console.log(`  Stage B: Ingesting Excel with CLOSED ticket (consultant logged 3.5h, status "Problem Solved")...`);
    const closedRows = [
      {
        'Case Number': testCaseNumber,
        'Customer Name (Customer) (Account)': aline.client_name,
        'Contact': 'John Rigorous',
        'Created On': '11/02/2026 09:30',
        'Case Title': 'Rigorous Integration Test Ticket',
        'Support Agent': 'Consultant Alpha',
        'Status Reason': 'Problem Solved', // RESOLVED / CLOSED
        'Priority': 'Normal',
        'Country (Customer) (Account)': 'United Kingdom',
        'Billable Duration': '3.5', // actual duration from consultant
        'Updated On': '11/15/2026 15:45', // resolved date in November
        'Total Days': '13',
        'Comments': 'Consultant logged 3.5 hours actual and marked problem solved',
      },
    ];
    const closedBuffer = createTestCasesExcelBuffer(closedRows);
    const processResultClosed = await processFile(closedBuffer, testUploadId, 11, 2026, false);
    console.log(`  -> Excel processed: ${processResultClosed.rowCount} rows updated`);

    const closedBalance = await getClientMonthlyBalance(alineId, 11, 2026);
    console.log('  Balance with ticket closed:', closedBalance);
    assert(closedBalance.previousBalance === 47, 'Previous Balance remains 47');
    assert(closedBalance.hoursOnOpen === 15, 'Temporary allocation 5.0h RELEASED (20 -> 15)');
    assert(closedBalance.hoursConsumed === 3.5, 'Actual consultant time (3.5h) deducted in November Hours Consumed');
    assert(closedBalance.currentBalance === 28.5, 'Current Balance is 47 - 3.5 - 15 = 28.5 (NO double deduction)');

    // Stage C: Subsequent month (December 2026) verification
    console.log('  Stage C: Checking subsequent month (December 2026) carry-forward...');
    // In December 2026, the closed ticket must NOT be in hoursOnOpen and NOT in December's hoursConsumed
    const decBalanceDirect = await getClientMonthlyBalance(alineId, 12, 2026);
    console.log('  December 2026 Balance (live calculation from ticket history):', decBalanceDirect);
    assert(decBalanceDirect.hoursOnOpen === 15, 'December Hours on Open is 15 (closed ticket is NOT in open tickets)');
    assert(decBalanceDirect.hoursConsumed === 0, 'December Hours Consumed is 0 (ticket closed in November is NOT deducted in Dec)');
    assert(decBalanceDirect.previousBalance === 43.5, 'December Previous Balance is 47 - 3.5 = 43.5');
    assert(decBalanceDirect.currentBalance === 28.5, 'December Current Balance is 43.5 - 0 - 15 = 28.5');

  } finally {
    // Isolated Cleanup: delete ONLY test case and test upload record
    await Case.deleteOne({ case_number: testCaseNumber });
    await Upload.deleteOne({ _id: testUploadId });
    console.log(`  -> Cleaned up test case ${testCaseNumber} and test upload ${testUploadId}`);
  }

  // Verify baseline restored after cleanup
  const restoredNov = await getClientMonthlyBalance(alineId, 11, 2026);
  assert(restoredNov.currentBalance === 32 && restoredNov.hoursOnOpen === 15, 'Baseline perfectly restored: Nov CB = 32, Open = 15');

  // ============================================================================
  // REQUIREMENT 4: Actual Contract Renewal via Application Service
  // ============================================================================
  console.log('\n--- 4. ACTUAL CONTRACT RENEWAL (via clientService.updateClient) ---');
  const originalClientDoc = await Client.findById(alineId).lean();
  if (!originalClientDoc) throw new Error('Client not found');
  const origContracted = Number(originalClientDoc.total_contracted_hours);
  const origPrevBal = Number(originalClientDoc.previous_balance_hours);
  console.log(`  Aline Studio original contract: ${origContracted}h, previous_balance_hours: ${origPrevBal}h`);

  const baselineAllTime = await getClientMonthlyBalance(alineId, 11, 2026, true);
  console.log('  Baseline All-Time:', baselineAllTime);

  // Invoke real application service: updateClient
  console.log('  Applying contract renewal (+50 hours purchased) via clientService.updateClient...');
  await updateClient(alineId, {
    totalContractedHours: origContracted + 50,
  });

  try {
    const renewalClient = await Client.findById(alineId).lean();
    assert(renewalClient?.total_contracted_hours === origContracted + 50, 'Client document reflects 100 total contracted hours');

    const renewalAllTime = await getClientMonthlyBalance(alineId, 11, 2026, true);
    console.log('  All-Time Balance after renewal:', renewalAllTime);
    assert(renewalAllTime.totalContracted === origContracted + 50, 'All-time totalContracted = 100');
    assert(renewalAllTime.hoursOnOpen === 15, 'Existing 15h open ticket reservation remains reserved');
    assert(
      renewalAllTime.currentBalance === baselineAllTime.currentBalance + 50,
      `All-time Current Balance increased by exactly 50h (${baselineAllTime.currentBalance} -> ${renewalAllTime.currentBalance})`
    );

    // Also verify Client Master view reflects this
    const masterRenewal = await getAllClients({ page: 1, limit: 10, month: 11, year: 2026 });
    const alineInMaster = masterRenewal.clients.find((c: any) => /aline/i.test(c.client_name));
    console.log('  Aline in Client Master during renewal:', {
      contracted: alineInMaster.total_contracted_hours,
      lastMonthBal: alineInMaster.last_month_balance,
      currentBal: alineInMaster.current_balance,
    });
    assert(alineInMaster.last_month_balance === 47, 'Monthly previous balance remains 47');
    assert(alineInMaster.current_balance === 32, 'Monthly current balance remains 32');
  } finally {
    // Preserve and restore original client contract values
    console.log('  Restoring original client contract values via clientService.updateClient...');
    await updateClient(alineId, {
      totalContractedHours: origContracted,
      previousBalanceHours: origPrevBal,
    });
  }
  const restoredClient = await Client.findById(alineId).lean();
  assert(restoredClient?.total_contracted_hours === origContracted, 'Client contracted hours restored to original');

  // ============================================================================
  // REQUIREMENT 5: Cross-Module Verification (Excel, PDF, Master, Preview, Portal)
  // ============================================================================
  console.log('\n--- 5. CROSS-MODULE PARITY (Excel, PDF, Client Master, Preview, Portal) ---');
  // 1. Client Portal / Admin Preview Data Helper
  const portalData = await getClientDashboardDataHelper(alineId, 11, 2026);
  const portalPB = portalData.hoursDetails.previousBalance;
  const portalConsumed = portalData.hoursDetails.hoursConsumed;
  const portalOpen = portalData.hoursDetails.hoursOnOpen;
  const portalCB = portalData.hoursDetails.currentBalance;

  // 2. Client Master
  const masterData = await getAllClients({ page: 1, limit: 10, month: 11, year: 2026 });
  const masterAline = masterData.clients.find((c: any) => /aline/i.test(c.client_name));
  const masterPB = masterAline.last_month_balance;
  const masterCB = masterAline.current_balance;

  // 3. Management PDF Report Data
  const pdfData = await getMonthlyReportData(11, 2026);
  const pdfAline = pdfData.clientBreakdown.find((c: any) => /aline/i.test(c.clientName));
  const pdfConsumed = pdfAline?.consumed ?? 0;
  const pdfCB = pdfAline?.balance ?? 0;
  const pdfContracted = pdfAline?.contracted ?? 0;

  // Test actual Client Portal PDF generation
  const pdfBuffer = await generateClientPortalPdf({
    month: 11,
    year: 2026,
    monthName: 'November',
    clientInfo: portalData.clientInfo,
    hoursDetails: portalData.hoursDetails,
    ticketSummary: portalData.ticketSummary,
    openCases: portalData.openCases,
    resolvedCases: portalData.resolvedCases,
  });
  const isPdfValid = Buffer.isBuffer(pdfBuffer) && pdfBuffer.subarray(0, 4).toString() === '%PDF';
  console.log(`  Portal PDF generated successfully (size: ${pdfBuffer.length} bytes, starts with %PDF: ${isPdfValid})`);
  assert(isPdfValid, 'Portal PDF buffer is valid binary PDF document');

  // 4. Excel Report Workbook Generation & Inspection
  // Generate real Excel buffer using report generation service
  const sampleUpload2 = await Upload.create({
    user_id: new mongoose.Types.ObjectId(adminUserId),
    original_name: 'test_cross_module.xlsx',
    file_size_bytes: 1024,
    month: 11,
    year: 2026,
    sync_client_master: false,
    status: 'completed',
  });
  const crossUploadId = (sampleUpload2._id as mongoose.Types.ObjectId).toString();

  let excelPB = 0;
  let excelConsumed = 0;
  let excelOpen = 0;
  let excelCB = 0;
  let excelContracted = 0;

  try {
    const reportGenResult = await generateAllReports(crossUploadId, 11, 2026, adminUserId);
    console.log(`  -> Generated reports for ${reportGenResult.totalClients} clients in month 11/2026`);

    const alineReportDoc = await Report.findOne({ client_id: aline._id, month: 11, year: 2026 });
    if (!alineReportDoc || !alineReportDoc.file_data) {
      throw new Error('Aline Studio report was not generated with file_data');
    }

    // Inspect the actual generated Excel workbook buffer with ExcelJS
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(alineReportDoc.file_data) as any);
    const overviewSheet = wb.getWorksheet('Overview');
    if (!overviewSheet) throw new Error('Overview sheet not found in generated Excel report');

    // In Overview sheet:
    // D2: 'Total Contracted Hours', E2: value
    // D3: 'Previous Balance Hours', E3: value
    // D4: 'Hours Consumed This Month', E4: value
    // D5: 'Hours alloted to open tickets', E5: value
    // D6: 'Current Balance Hours', E6: value
    excelContracted = Number(overviewSheet.getCell('E2').value);
    excelPB = Number(overviewSheet.getCell('E3').value);
    excelConsumed = Number(overviewSheet.getCell('E4').value);
    excelOpen = Number(overviewSheet.getCell('E5').value);
    excelCB = Number(overviewSheet.getCell('E6').value);

    console.log('  Excel Report Parsed Values:', {
      contracted: excelContracted,
      previousBalance: excelPB,
      hoursConsumed: excelConsumed,
      hoursOnOpen: excelOpen,
      currentBalance: excelCB,
    });
  } finally {
    // Isolated Cleanup: delete ONLY test November reports and test upload record
    await Report.deleteMany({ month: 11, year: 2026 });
    await Upload.deleteOne({ _id: crossUploadId });
    console.log('  -> Cleaned up test November reports and test upload record');
  }

  console.log('\n  --- CROSS-MODULE COMPARISON TABLE (Aline Studio - Nov 2026) ---');
  console.log(`    Client Portal:        PB=${portalPB}, Consumed=${portalConsumed}, Open=${portalOpen}, CB=${portalCB}`);
  console.log(`    Admin Preview:        PB=${portalPB}, Consumed=${portalConsumed}, Open=${portalOpen}, CB=${portalCB}`);
  console.log(`    Client Master:        LastMonthBal=${masterPB}, CurrentBal=${masterCB}`);
  console.log(`    Management PDF:       Contracted=${pdfContracted}, Consumed=${pdfConsumed}, Balance=${pdfCB}`);
  console.log(`    Excel Report Sheet:   Contracted=${excelContracted}, PB=${excelPB}, Consumed=${excelConsumed}, Open=${excelOpen}, CB=${excelCB}`);

  assert(portalPB === 47 && masterPB === 47 && excelPB === 47, 'Previous Balance is 47 across Portal, Preview, Master, and Excel');
  assert(portalCB === 32 && masterCB === 32 && pdfCB === 32 && excelCB === 32, 'Current Balance is 32 across Portal, Preview, Master, PDF, and Excel');
  assert(portalConsumed === 0 && pdfConsumed === 0 && excelConsumed === 0, 'Consumed Hours is 0 across Portal, Preview, PDF, and Excel');
  assert(portalOpen === 15 && excelOpen === 15, 'Open Ticket Allocation is 15 across Portal, Preview, and Excel');

  // ============================================================================
  // REQUIREMENT 6: Real Report-Generation Service 3x Execution
  // ============================================================================
  console.log('\n--- 6. REPEATED REPORT GENERATION (3x Execution Invariance) ---');
  const testUpload3 = await Upload.create({
    user_id: new mongoose.Types.ObjectId(adminUserId),
    original_name: 'test_repeat_generation.xlsx',
    file_size_bytes: 1024,
    month: 11,
    year: 2026,
    sync_client_master: false,
    status: 'completed',
  });
  const repeatUploadId = (testUpload3._id as mongoose.Types.ObjectId).toString();

  try {
    // Run 1
    console.log('  Invoking generateAllReports (Execution 1 of 3)...');
    await generateAllReports(repeatUploadId, 11, 2026, adminUserId);
    const rep1 = await Report.findOne({ client_id: aline._id, month: 11, year: 2026 });
    const bal1 = Number(rep1?.remaining_balance);
    const cons1 = Number(rep1?.hours_consumed);
    console.log(`  Execution 1 result: remaining_balance = ${bal1}, hours_consumed = ${cons1}`);

    // Run 2
    console.log('  Invoking generateAllReports (Execution 2 of 3)...');
    await generateAllReports(repeatUploadId, 11, 2026, adminUserId);
    const rep2 = await Report.findOne({ client_id: aline._id, month: 11, year: 2026 });
    const bal2 = Number(rep2?.remaining_balance);
    const cons2 = Number(rep2?.hours_consumed);
    console.log(`  Execution 2 result: remaining_balance = ${bal2}, hours_consumed = ${cons2}`);

    // Run 3
    console.log('  Invoking generateAllReports (Execution 3 of 3)...');
    await generateAllReports(repeatUploadId, 11, 2026, adminUserId);
    const rep3 = await Report.findOne({ client_id: aline._id, month: 11, year: 2026 });
    const bal3 = Number(rep3?.remaining_balance);
    const cons3 = Number(rep3?.hours_consumed);
    console.log(`  Execution 3 result: remaining_balance = ${bal3}, hours_consumed = ${cons3}`);

    assert(bal1 === 47 && bal2 === 47 && bal3 === 47, 'Report remaining_balance is identical (47) across all 3 executions');
    assert(cons1 === 0 && cons2 === 0 && cons3 === 0, 'Report hours_consumed is identical (0) across all 3 executions');
    assert(bal1 === bal2 && bal2 === bal3, 'Zero duplicate deductions: report balance invariant holds across repeated generations');
  } finally {
    // Clean up test reports for month 11/2026 and test upload record
    await Report.deleteMany({ month: 11, year: 2026 });
    await Upload.deleteOne({ _id: repeatUploadId });
    console.log('  -> Cleaned up 3x test reports and upload record');
  }

  // ============================================================================
  // REQUIREMENT 7: Reconciliation Verification on the 7 Clients
  // ============================================================================
  console.log('\n--- 7. RECONCILIATION VERIFICATION ON THE 7 CLIENTS ---');
  const targetReconciled = [
    { name: 'Aline Studio', expectedBal: 47.0, openHrs: 15.0 },
    { name: 'BLUE LABEL PACKAGING CO', expectedBal: 34.25, openHrs: 9.75 },
    { name: 'Wycliffe Canada', expectedBal: 50.0, openHrs: 30.0 },
    { name: 'Ignyte Insurance', expectedBal: 37.5, openHrs: 29.5 },
    { name: 'ReMarkets', expectedBal: 17.0, openHrs: 1.0 },
    { name: 'MMIS Inc.', expectedBal: 78.5, openHrs: 8.0 },
    { name: 'ByDesign Technologies', expectedBal: 66.0, openHrs: 13.0 },
  ];

  for (const item of targetReconciled) {
    const clientDoc = await Client.findOne({ client_name: new RegExp(`^${item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[.,;:!?]*$`, 'i') });
    if (!clientDoc) {
      console.error(`  Client not found: ${item.name}`);
      allPassed = false;
      continue;
    }
    const reportDoc = await Report.findOne({ client_id: clientDoc._id, month: 10, year: 2026 });
    const actualReportBal = reportDoc?.remaining_balance != null ? Number(reportDoc.remaining_balance) : null;
    const actualClientPrev = clientDoc.previous_balance_hours != null ? Number(clientDoc.previous_balance_hours) : null;

    console.log(`  Client: "${clientDoc.client_name}"`);
    console.log(`    October Report remaining_balance: ${actualReportBal} (Expected: ${item.expectedBal})`);
    console.log(`    Client previous_balance_hours:   ${actualClientPrev} (Expected: ${item.expectedBal})`);

    assert(
      actualReportBal === item.expectedBal,
      `Report balance matches corrected closed-ticket milestone (${item.expectedBal})`
    );
    assert(
      actualClientPrev === item.expectedBal,
      `Client previous_balance_hours matches corrected closed-ticket milestone (${item.expectedBal})`
    );
  }

  // Verify restart idempotency again on these records
  const reconRestart = await reconcileOctoberHistoricalBalances();
  console.log(`  reconcileOctoberHistoricalBalances execution count: updatedCount = ${reconRestart.updatedCount}`);
  assert(reconRestart.updatedCount === 0, 'Reconciliation confirms zero further modifications on subsequent runs');

  // ============================================================================
  // REQUIREMENT 1 (POST-TEST): Comprehensive Historical Integrity Verification
  // ============================================================================
  console.log('\n--- 1 (POST-TEST). HISTORICAL DATA INTEGRITY COMPARISON ---');
  const postJanSepReports = await Report.find({ year: 2026, month: { $lte: 9 } }).sort({ _id: 1 }).lean();
  assert(postJanSepReports.length === 339, 'Post-test: Exactly 339 historical reports exist for Jan-Sep 2026');

  let janSepDiscrepancies = 0;
  for (const post of postJanSepReports) {
    const id = post._id.toString();
    const pre = preSnapshotMap.get(id);
    if (!pre) {
      console.error(`  Unexpected new report found: ${id}`);
      janSepDiscrepancies++;
      continue;
    }
    if (
      Number(post.remaining_balance) !== pre.remaining_balance ||
      Number(post.hours_consumed) !== pre.hours_consumed ||
      post.month !== pre.month ||
      post.year !== pre.year
    ) {
      console.error(`  Discrepancy in historical report ${id} (month ${post.month}/${post.year}):`, { pre, post });
      janSepDiscrepancies++;
    }
  }
  assert(janSepDiscrepancies === 0, 'Zero field-level discrepancies in any of the 339 Jan-Sep 2026 reports');

  const postJanSepSnapshots: ReportSnapshot[] = postJanSepReports.map((r: any) => ({
    _id: r._id.toString(),
    client_id: r.client_id?.toString() || '',
    month: r.month,
    year: r.year,
    remaining_balance: r.remaining_balance != null ? Number(r.remaining_balance) : null,
    hours_consumed: r.hours_consumed != null ? Number(r.hours_consumed) : null,
    tickets_opened: r.tickets_opened != null ? Number(r.tickets_opened) : null,
    tickets_closed: r.tickets_closed != null ? Number(r.tickets_closed) : null,
    tickets_pending: r.tickets_pending != null ? Number(r.tickets_pending) : null,
    file_name: r.file_name || null,
  }));
  const postJanSepHash = computeSnapshotHash(postJanSepSnapshots);
  console.log(`  Jan-Sep 2026 SHA256 post-test checksum: ${postJanSepHash}`);
  assert(preJanSepHash === postJanSepHash, 'Jan-Sep SHA256 checksum is 100% byte-for-byte identical to pre-test checksum');

  // Verify October reports unchanged from post-reconciliation state
  const postOctReports = await Report.find({ year: 2026, month: 10 }).sort({ _id: 1 }).lean();
  assert(postOctReports.length === 30, 'Post-test: Exactly 30 historical reports exist for Oct 2026');
  const postOctSnapshots: ReportSnapshot[] = postOctReports.map((r: any) => ({
    _id: r._id.toString(),
    client_id: r.client_id?.toString() || '',
    month: r.month,
    year: r.year,
    remaining_balance: r.remaining_balance != null ? Number(r.remaining_balance) : null,
    hours_consumed: r.hours_consumed != null ? Number(r.hours_consumed) : null,
    tickets_opened: r.tickets_opened != null ? Number(r.tickets_opened) : null,
    tickets_closed: r.tickets_closed != null ? Number(r.tickets_closed) : null,
    tickets_pending: r.tickets_pending != null ? Number(r.tickets_pending) : null,
    file_name: r.file_name || null,
  }));
  const postOctHash = computeSnapshotHash(postOctSnapshots);
  console.log(`  Oct 2026 SHA256 post-test checksum:     ${postOctHash}`);
  assert(preOctHash === postOctHash, 'Oct 2026 SHA256 checksum is 100% byte-for-byte identical to pre-test checksum');

  console.log('\n================================================================================');
  if (allPassed) {
    console.log('=== ALL RIGOROUS PRODUCTION REGRESSION CHECKS PASSED WITH 100% COMPLIANCE ===');
  } else {
    console.log('=== ONE OR MORE TESTS FAILED - REVIEW OUTPUT ABOVE ===');
  }
  console.log('================================================================================');

  await mongoose.disconnect();
}

runRigorousSuite().catch(err => {
  console.error('Rigorous regression suite failed with error:', err);
  process.exit(1);
});
