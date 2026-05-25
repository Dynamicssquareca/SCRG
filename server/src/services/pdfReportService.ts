import PDFDocument from 'pdfkit';
import dayjs from 'dayjs';
import mongoose from 'mongoose';
import { Client } from '../models/Client';
import { Case } from '../models/Case';
import { Report } from '../models/Report';
import logger from '../utils/logger';

const closedStatusRegex = /resolved|closed|problem solved/i;

interface MonthlyReportData {
  month: number;
  year: number;
  monthName: string;
  stats: {
    totalCreated: number;
    totalResolved: number;
    activeClients: number;
    totalHoursConsumed: number;
  };
  comparison: {
    label1: string;
    label2: string;
    created1: number;
    resolved1: number;
    created2: number;
    resolved2: number;
  };
  clientBreakdown: Array<{
    clientName: string;
    created: number;
    resolved: number;
    contracted: number;
    consumed: number;
    balance: number;
  }>;
  consultantWorkload: Array<{
    agent: string;
    openCount: number;
  }>;
  backlog: Array<{
    caseNumber: string;
    clientName: string;
    subject: string;
    createdOn: string;
    status: string;
    ageDays: number;
  }>;
}

/** Gathers report data for a specific month and year, with optional bi-weekly mode (1st-14th day only) */
export async function getMonthlyReportData(month: number, year: number, isBiWeekly: boolean = false): Promise<MonthlyReportData> {
  let start: Date;
  let end: Date;
  let prevStart: Date;
  let prevEnd: Date;
  let label1: string;
  let label2: string;

  const monthStart = new Date(year, month - 1, 1);
  const monthName = dayjs(monthStart).format('MMMM');

  const prevMonthIdx = month - 2;
  const prevMonthNum = prevMonthIdx < 0 ? 12 : prevMonthIdx + 1;
  const prevYearNum = prevMonthIdx < 0 ? year - 1 : year;

  if (isBiWeekly) {
    // 1st to 14th day of the current month
    start = new Date(year, month - 1, 1);
    end = new Date(year, month - 1, 14, 23, 59, 59, 999);
    
    // 1st to 14th day of the previous month
    prevStart = new Date(prevYearNum, prevMonthNum - 1, 1);
    prevEnd = new Date(prevYearNum, prevMonthNum - 1, 14, 23, 59, 59, 999);

    label1 = `${dayjs(prevStart).format('MMM 01-14')} ${prevYearNum}`;
    label2 = `${dayjs(start).format('MMM 01-14')} ${year}`;
  } else {
    // Full calendar month
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 0, 23, 59, 59, 999);

    // Full calendar previous month
    prevStart = new Date(prevYearNum, prevMonthNum - 1, 1);
    prevEnd = new Date(prevYearNum, prevMonthNum, 0, 23, 59, 59, 999);

    label1 = dayjs(prevStart).format('MMM YYYY');
    label2 = dayjs(start).format('MMM YYYY');
  }

  // 1. Overall stats
  const totalCreated = await Case.countDocuments({
    created_on: { $gte: start, $lte: end },
  });

  const totalResolved = await Case.countDocuments({
    updated_on: { $gte: start, $lte: end },
    status_reason: { $regex: closedStatusRegex },
  });

  const activeClientsCount = await Client.countDocuments({ is_active: true });

  // 2. Total hours consumed this period
  const casesResolvedThisPeriod = await Case.find({
    updated_on: { $gte: start, $lte: end },
    status_reason: { $regex: closedStatusRegex },
  });
  const totalHoursConsumed = casesResolvedThisPeriod.reduce(
    (sum, c) => sum + (Number(c.billable_duration) || 0),
    0
  );

  // 3. Comparison Stats (period1 vs period2)
  const created1 = await Case.countDocuments({ created_on: { $gte: prevStart, $lte: prevEnd } });
  const resolved1 = await Case.countDocuments({ updated_on: { $gte: prevStart, $lte: prevEnd }, status_reason: { $regex: closedStatusRegex } });

  const created2 = totalCreated;
  const resolved2 = totalResolved;

  // 4. Client Breakdown
  const clients = await Client.find({ is_active: true }).sort({ client_name: 1 });
  const clientBreakdown = [];

  for (const client of clients) {
    // Only fetch from Report collection for full month, not bi-weekly
    const reportDoc = !isBiWeekly ? await Report.findOne({ client_id: client._id, month, year }) : null;
    
    let created = 0;
    let resolved = 0;
    let consumed = 0;
    let balance = client.previous_balance_hours;

    if (reportDoc) {
      created = reportDoc.tickets_opened;
      resolved = reportDoc.tickets_closed;
      consumed = reportDoc.hours_consumed;
      balance = reportDoc.remaining_balance;
    } else {
      // Calculate dynamically if report is not pre-generated
      created = await Case.countDocuments({
        client_id: client._id,
        created_on: { $gte: start, $lte: end },
      });
      const resolvedCases = await Case.find({
        client_id: client._id,
        updated_on: { $gte: start, $lte: end },
        status_reason: { $regex: closedStatusRegex },
      });
      resolved = resolvedCases.length;
      consumed = resolvedCases.reduce((sum, c) => sum + (Number(c.billable_duration) || 0), 0);
      balance = client.previous_balance_hours - consumed;
    }

    clientBreakdown.push({
      clientName: client.client_name,
      created,
      resolved,
      contracted: client.total_contracted_hours || 0,
      consumed,
      balance,
    });
  }

  // 5. Consultant Workload (Top 8 active agents with open ticket counts)
  const consultantWorkload = await Case.aggregate([
    { $match: { status_reason: { $not: closedStatusRegex }, support_agent: { $nin: [null, ''] } } },
    { $group: { _id: '$support_agent', openCount: { $sum: 1 } } },
    { $sort: { openCount: -1 } },
    { $limit: 8 },
    { $project: { _id: 0, agent: '$_id', openCount: 1 } },
  ]);

  // 6. Oldest 10 open cases
  const openCases = await Case.find({
    status_reason: { $not: closedStatusRegex },
  })
    .sort({ created_on: 1 })
    .limit(10)
    .populate('client_id');

  const backlog = openCases.map((c: any) => {
    const createdDate = c.created_on ? dayjs(c.created_on) : dayjs();
    const ageDays = dayjs().diff(createdDate, 'day');
    return {
      caseNumber: c.case_number || 'N/A',
      clientName: c.client_id?.client_name || 'N/A',
      subject: c.case_title || 'No Subject',
      createdOn: c.created_on ? dayjs(c.created_on).format('DD-MM-YYYY') : 'N/A',
      status: c.status_reason || 'Open',
      ageDays,
    };
  });

  return {
    month,
    year,
    monthName,
    stats: {
      totalCreated,
      totalResolved,
      activeClients: activeClientsCount,
      totalHoursConsumed,
    },
    comparison: {
      label1,
      label2,
      created1,
      resolved1,
      created2,
      resolved2,
    },
    clientBreakdown,
    consultantWorkload,
    backlog,
  };
}

/** Generates a beautiful PDF report and returns it as a Buffer */
export async function generateMonthlyPdfReport(data: MonthlyReportData, isBiWeekly: boolean = false): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 25, left: 40, right: 40 },
      bufferPages: true,
    });

    const buffers: Buffer[] = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    // Colors
    const primaryColor = '#111318'; // Dark charcoal
    const secondaryColor = '#E8363D'; // Accent red
    const darkBlue = '#1B3A5C'; // Theme deep blue
    const tealColor = '#006B7B'; // Theme teal
    const textGray = '#4B5568';
    const lightGrayBg = '#F7F8FC';
    const borderGray = '#E8ECF4';

    // Helper: Draw Header & Brand line on pages (except cover)
    const drawPageHeader = (pageTitle: string) => {
      // Top bar
      doc.rect(0, 0, 595.28, 50).fill(primaryColor);
      
      // Branding
      doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold')
        .text('DYNAMICS ', 40, 18, { continued: true })
        .fillColor(secondaryColor).text('SQUARE™');

      doc.fillColor('#AAAAAA').fontSize(8).font('Helvetica')
        .text(isBiWeekly ? 'BI-WEEKLY SUPPORT REPORT' : 'MONTHLY SUPPORT REPORT', 400, 20, { align: 'right', width: 155 });

      // Page Title Indicator
      doc.fillColor(primaryColor).fontSize(16).font('Helvetica-Bold').text(pageTitle, 40, 75);
      
      const periodLabel = isBiWeekly
        ? `${data.monthName} 01 - 14, ${data.year} Edition`
        : `${data.monthName} ${data.year} Edition`;
      doc.fontSize(10).font('Helvetica').fillColor(textGray).text(periodLabel, 40, 95);
      
      // Divider
      doc.moveTo(40, 110).lineTo(555.28, 110).strokeColor(borderGray).lineWidth(1).stroke();
    };

    // Helper: Draw Footer with Page numbers
    const drawPageFooter = (pageNum: number, totalPages: number) => {
      doc.moveTo(40, 790).lineTo(555.28, 790).strokeColor(borderGray).lineWidth(1).stroke();
      doc.fillColor('#9CA3AF').fontSize(8).font('Helvetica')
        .text('Dynamics Square Support Report system — Confidential', 40, 800)
        .text(`Page ${pageNum} of ${totalPages}`, 400, 800, { align: 'right', width: 155 });
    };

    // ==========================================
    // PAGE 1: COVER PAGE
    // ==========================================
    doc.rect(0, 0, 595.28, 841.89).fill(primaryColor);

    // Accent Graphics (Geometric blocks)
    doc.rect(0, 0, 15, 841.89).fill(secondaryColor);
    doc.rect(580, 0, 15, 841.89).fill(darkBlue);

    // Logo at the top of cover page
    doc.save();
    doc.rect(60, 80, 16, 16).fill(secondaryColor);
    doc.rect(80, 80, 16, 16).fill('rgba(255,255,255,0.4)');
    doc.rect(60, 100, 16, 16).fill('rgba(255,255,255,0.4)');
    doc.rect(80, 100, 16, 16).fill(secondaryColor);
    
    doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold')
      .text('DYNAMICS ', 106, 88, { continued: true })
      .fillColor(secondaryColor).text('SQUARE™');
    doc.restore();

    // Cover Content
    doc.fillColor('#FFFFFF').fontSize(32).font('Helvetica-Bold')
      .text(isBiWeekly ? 'BI-WEEKLY' : 'MONTHLY', 60, 240)
      .fillColor(secondaryColor).text('SUPPORT PERFORMANCE', 60, 280)
      .fillColor('#FFFFFF').text('REPORT', 60, 320);

    doc.moveTo(60, 380).lineTo(300, 380).strokeColor(secondaryColor).lineWidth(4).stroke();

    const coverPeriod = isBiWeekly
      ? `Period: ${data.monthName} 01 - 14, ${data.year}`
      : `Period: ${data.monthName} ${data.year}`;
    doc.fillColor('#E2E8F0').fontSize(16).font('Helvetica-Bold').text(coverPeriod, 60, 410);

    // Meta details card (Solid background with borders for high visibility)
    doc.rect(60, 500, 380, 70).fill('#1A202C');
    doc.rect(60, 500, 380, 70).strokeColor('#2D3748').lineWidth(1).stroke();
    
    doc.fillColor('#94A3B8').fontSize(9).font('Helvetica-Bold').text('GENERATED ON', 80, 518);
    doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica').text(dayjs().format('MMMM DD, YYYY — HH:mm'), 80, 534);

    // Bottom Branding
    doc.fillColor('#E2E8F0').fontSize(14).font('Helvetica-Bold')
      .text('DYNAMICS ', 60, 750, { continued: true })
      .fillColor(secondaryColor).text('SQUARE™');
    
    doc.fillColor('#64748B').fontSize(10).font('Helvetica').text('© 2026 MPG Business Information Systems. All rights reserved.', 60, 770);

    // ==========================================
    // PAGE 2: EXECUTIVE SUMMARY & CHARTS
    // ==========================================
    doc.addPage();
    drawPageHeader('Executive Summary & Insights');

    // Stats Grid (4 Metric cards)
    const cardW = 110;
    const cardH = 65;
    const cardY = 130;
    
    const cardDetails = [
      { label: 'Active Clients', val: String(data.stats.activeClients), color: '#3182CE', bg: '#EBF8FF' },
      { label: 'Tickets Created', val: String(data.stats.totalCreated), color: '#319795', bg: '#E6FFFA' },
      { label: 'Tickets Resolved', val: String(data.stats.totalResolved), color: '#DD6B20', bg: '#FFFAF0' },
      { label: 'Hours Consumed', val: `${data.stats.totalHoursConsumed.toFixed(1)}h`, color: '#805AD5', bg: '#FAF5FF' },
    ];

    cardDetails.forEach((c, idx) => {
      const cardX = 40 + idx * (cardW + 12);
      // Card BG
      doc.rect(cardX, cardY, cardW, cardH).fill(c.bg);
      // Top accent bar
      doc.rect(cardX, cardY, cardW, 4).fill(c.color);
      // Label
      doc.fillColor(textGray).fontSize(8).font('Helvetica-Bold').text(c.label, cardX + 10, cardY + 12, { width: cardW - 20 });
      // Value
      doc.fillColor('#1A202C').fontSize(18).font('Helvetica-Bold').text(c.val, cardX + 10, cardY + 32, { width: cardW - 20 });
    });

    // Chart Title
    doc.fillColor(primaryColor).fontSize(14).font('Helvetica-Bold').text('Monthly Ticket Activity Comparison', 40, 220);
    doc.fillColor(textGray).fontSize(9).font('Helvetica').text('Comparison of total tickets created vs resolved in the last two periods.', 40, 238);

    // Let's Draw the Custom Vector Bar Chart
    const chartX = 50;
    const chartY = 270;
    const chartW = 460;
    const chartH = 180;

    // Gridlines & Y-Axis Scale
    const maxVal = Math.max(data.comparison.created1, data.comparison.resolved1, data.comparison.created2, data.comparison.resolved2, 10);
    const tickInterval = Math.ceil(maxVal / 4);
    const scaleMax = tickInterval * 4;

    for (let i = 0; i <= 4; i++) {
      const gridY = chartY + chartH - (i * chartH) / 4;
      const gridVal = i * tickInterval;

      // Line
      doc.moveTo(chartX, gridY).lineTo(chartX + chartW, gridY).strokeColor('#E2E8F0').lineWidth(1).stroke();
      // Tick text
      doc.fillColor('#94A3B8').fontSize(8).font('Helvetica').text(String(gridVal), chartX - 25, gridY - 4, { align: 'right', width: 20 });
    }

    // Bar drawing math
    const colW = 120;
    const spaceBetweenCols = 90;
    
    const drawGroupedBars = (xCenter: number, label: string, created: number, resolved: number) => {
      const hCreated = (created / scaleMax) * chartH;
      const hResolved = (resolved / scaleMax) * chartH;

      const barW = 28;
      const barYCreated = chartY + chartH - hCreated;
      const barYResolved = chartY + chartH - hResolved;

      // Created Bar (dark blue)
      doc.rect(xCenter - barW - 4, barYCreated, barW, hCreated).fill(darkBlue);
      // Resolved Bar (accent red)
      doc.rect(xCenter + 4, barYResolved, barW, hResolved).fill(tealColor);

      // Label under columns
      doc.fillColor('#2D3748').fontSize(9).font('Helvetica-Bold').text(label, xCenter - 60, chartY + chartH + 10, { align: 'center', width: 120 });
    };

    drawGroupedBars(chartX + 110, data.comparison.label1, data.comparison.created1, data.comparison.resolved1);
    drawGroupedBars(chartX + 310, data.comparison.label2, data.comparison.created2, data.comparison.resolved2);

    // Legend
    const legendY = chartY + chartH + 35;
    // Created dot & text
    doc.rect(chartX + 130, legendY, 12, 12).fill(darkBlue);
    doc.fillColor(textGray).fontSize(8).font('Helvetica').text('Tickets Created (All)', chartX + 148, legendY + 2);

    // Resolved dot & text
    doc.rect(chartX + 260, legendY, 12, 12).fill(tealColor);
    doc.fillColor(textGray).fontSize(8).font('Helvetica').text('Tickets Resolved', chartX + 278, legendY + 2);

    // Summary Insights Card
    const insY = 510;
    doc.rect(40, insY, 515, 130).fill(lightGrayBg);
    doc.rect(40, insY, 4, 130).fill(tealColor);

    doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('Key Highlights & Insights', 60, insY + 15);
    
    // Custom highlights text
    const activeText = `Active Clients: There are currently ${data.stats.activeClients} active accounts tracked in the portal system.`;
    const resolutionText = `Performance Ratio: During ${data.monthName}, ${data.stats.totalCreated} new tickets were logged, while ${data.stats.totalResolved} tickets were fully resolved and closed (including backlog cases).`;
    const workloadText = `Labor Utilization: Support consultants completed ${data.stats.totalHoursConsumed.toFixed(1)} billable support hours in total during the month of ${data.monthName} ${data.year}.`;

    doc.fillColor(textGray).fontSize(9).font('Helvetica')
      .text(`•  ${activeText}`, 60, insY + 38, { width: 475, lineGap: 3 })
      .text(`•  ${resolutionText}`, 60, insY + 68, { width: 475, lineGap: 3 })
      .text(`•  ${workloadText}`, 60, insY + 98, { width: 475, lineGap: 3 });

    // ==========================================
    // PAGE 3: CLIENT BREAKDOWN TABLE
    // ==========================================
    doc.addPage();
    drawPageHeader('Client Metrics & Consumption');

    // Table Header
    const clientTableY = 130;
    const drawTableHeader = (y: number) => {
      doc.rect(40, y, 515, 24).fill(darkBlue);
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      doc.text('Client Name', 46, y + 8, { width: 140 });
      doc.text('Created', 190, y + 8, { width: 50, align: 'center' });
      doc.text('Resolved', 245, y + 8, { width: 50, align: 'center' });
      doc.text('Contr. Hours', 300, y + 8, { width: 65, align: 'center' });
      doc.text('Cons. Hours', 370, y + 8, { width: 65, align: 'center' });
      doc.text('Balance Hours', 440, y + 8, { width: 110, align: 'center' });
    };

    drawTableHeader(clientTableY);

    let rowY = clientTableY + 24;
    let zebra = false;

    data.clientBreakdown.forEach((client, idx) => {
      // Check if we need to add a new page (limit of ~22 items per page)
      if (rowY > 730) {
        doc.addPage();
        drawPageHeader('Client Metrics & Consumption (Cont.)');
        drawTableHeader(130);
        rowY = 154;
      }

      // BG
      if (zebra) {
        doc.rect(40, rowY, 515, 20).fill('#F9FAFB');
      }
      doc.rect(40, rowY, 515, 20).strokeColor(borderGray).lineWidth(0.5).stroke();

      // Content
      doc.fillColor('#1A202C').fontSize(8).font('Helvetica-Bold');
      doc.text(client.clientName, 46, rowY + 6, { width: 140, ellipsis: true });

      doc.font('Helvetica').fillColor(textGray);
      doc.text(String(client.created), 190, rowY + 6, { width: 50, align: 'center' });
      doc.text(String(client.resolved), 245, rowY + 6, { width: 50, align: 'center' });
      doc.text(client.contracted.toFixed(1), 300, rowY + 6, { width: 65, align: 'center' });
      doc.text(client.consumed.toFixed(1), 370, rowY + 6, { width: 65, align: 'center' });

      // Balance Hours styling (red if negative, green if positive)
      const balStr = client.balance.toFixed(1);
      const isNegative = client.balance < 0;
      doc.fillColor(isNegative ? '#E53E3E' : '#319795').font('Helvetica-Bold');
      doc.text(balStr, 440, rowY + 6, { width: 110, align: 'center' });

      rowY += 20;
      zebra = !zebra;
    });

    // ==========================================
    // PAGE 4: CONSULTANT & BACKLOG TIMELINES
    // ==========================================
    doc.addPage();
    drawPageHeader('Consultant Workload & Backlog Age');

    // Consultant list
    doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('Active Consultant Open Cases Load', 40, 130);
    
    let consY = 155;
    if (data.consultantWorkload.length === 0) {
      doc.fillColor(textGray).fontSize(9).font('Helvetica').text('No active open tickets logged to consultants.', 40, consY);
      consY += 30;
    } else {
      // Let's draw horizontal indicator bars
      const barMaxW = 200;
      const maxCount = Math.max(...data.consultantWorkload.map(c => c.openCount), 5);

      data.consultantWorkload.forEach((c) => {
        doc.fillColor('#2D3748').fontSize(9).font('Helvetica-Bold').text(c.agent, 40, consY + 3, { width: 120 });
        
        // Bar
        const barW = (c.openCount / maxCount) * barMaxW;
        doc.rect(170, consY, barW, 12).fill(darkBlue);
        
        // Count text
        doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold').text(`${c.openCount} tickets open`, 180 + barW, consY + 3);
        
        consY += 22;
      });
    }

    // Backlog timelines
    doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('Top 10 Oldest Unresolved Tickets (Backlog)', 40, 360);

    const backlogTableY = 385;
    doc.rect(40, backlogTableY, 515, 20).fill(tealColor);
    doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
    doc.text('Case #', 46, backlogTableY + 6, { width: 60 });
    doc.text('Client', 110, backlogTableY + 6, { width: 90 });
    doc.text('Subject / Title', 205, backlogTableY + 6, { width: 170 });
    doc.text('Created On', 380, backlogTableY + 6, { width: 65, align: 'center' });
    doc.text('Age (Days)', 450, backlogTableY + 6, { width: 50, align: 'center' });
    doc.text('Status', 505, backlogTableY + 6, { width: 45, align: 'center' });

    let blY = backlogTableY + 20;
    let blZebra = false;

    if (data.backlog.length === 0) {
      doc.rect(40, blY, 515, 30).strokeColor(borderGray).lineWidth(0.5).stroke();
      doc.fillColor(textGray).fontSize(8).font('Helvetica').text('No open backlog cases found! Outstanding job.', 50, blY + 10, { align: 'center', width: 495 });
    } else {
      data.backlog.forEach((c) => {
        if (blZebra) {
          doc.rect(40, blY, 515, 20).fill('#F9FAFB');
        }
        doc.rect(40, blY, 515, 20).strokeColor(borderGray).lineWidth(0.5).stroke();

        doc.fillColor('#1A202C').fontSize(8).font('Helvetica-Bold');
        doc.text(c.caseNumber, 46, blY + 6, { width: 60 });

        doc.font('Helvetica').fillColor(textGray);
        doc.text(c.clientName, 110, blY + 6, { width: 90, ellipsis: true });
        doc.text(c.subject, 205, blY + 6, { width: 170, ellipsis: true });
        doc.text(c.createdOn, 380, blY + 6, { width: 65, align: 'center' });

        // Highlight age: dark red if > 30 days
        const isOld = c.ageDays > 30;
        doc.fillColor(isOld ? '#DC2626' : textGray).font(isOld ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(String(c.ageDays), 450, blY + 6, { width: 50, align: 'center' });

        doc.fillColor(textGray).font('Helvetica');
        doc.text(c.status, 505, blY + 6, { width: 45, align: 'center', ellipsis: true });

        blY += 20;
        blZebra = !blZebra;
      });
    }

    // ==========================================
    // DRAW FOOTERS & FINALIZE PAGES
    // ==========================================
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      if (i > 0) {
        drawPageFooter(i + 1, pages.count);
      }
    }

    doc.end();
  });
}
