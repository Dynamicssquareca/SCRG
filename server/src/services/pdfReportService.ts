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
    totalOpenCases: number;
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

  const totalOpenCases = await Case.countDocuments({
    status_reason: { $not: closedStatusRegex },
  });

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

  // 6. All open cases
  const openCases = await Case.find({
    status_reason: { $not: closedStatusRegex },
  })
    .sort({ created_on: 1 })
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
      totalOpenCases,
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
        .text('Dynamics Square Support Report system - Confidential', 40, 800)
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
    doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica').text(dayjs().format('MMMM DD, YYYY - HH:mm'), 80, 534);

    // Bottom Branding
    doc.fillColor('#E2E8F0').fontSize(14).font('Helvetica-Bold')
      .text('DYNAMICS ', 60, 750, { continued: true })
      .fillColor(secondaryColor).text('SQUARE™');

    // ==========================================
    // PAGE 2: EXECUTIVE SUMMARY & CHARTS
    // ==========================================
    doc.addPage();
    drawPageHeader('Executive Summary & Insights');

    // Stats Grid (5 Metric cards)
    const cardW = 93;
    const cardH = 65;
    const cardY = 130;
    
    const cardDetails = [
      { label: 'Active Clients', val: String(data.stats.activeClients), color: '#3182CE', bg: '#EBF8FF' },
      { label: 'Tickets Created', val: String(data.stats.totalCreated), color: '#319795', bg: '#E6FFFA' },
      { label: 'Tickets Resolved', val: String(data.stats.totalResolved), color: '#DD6B20', bg: '#FFFAF0' },
      { label: 'Hours Consumed', val: `${data.stats.totalHoursConsumed.toFixed(1)}h`, color: '#805AD5', bg: '#FAF5FF' },
      { label: 'Current Opened Tickets', val: String(data.stats.totalOpenCases ?? 0), color: '#E53E3E', bg: '#FEF2F2' },
    ];

    cardDetails.forEach((c, idx) => {
      const cardX = 40 + idx * (cardW + 12);
      // Card BG
      doc.rect(cardX, cardY, cardW, cardH).fill(c.bg);
      // Top accent bar
      doc.rect(cardX, cardY, cardW, 4).fill(c.color);
      // Label
      doc.fillColor(textGray).fontSize(7.5).font('Helvetica-Bold').text(c.label, cardX + 8, cardY + 12, { width: cardW - 16 });
      // Value
      doc.fillColor('#1A202C').fontSize(17).font('Helvetica-Bold').text(c.val, cardX + 8, cardY + 32, { width: cardW - 16 });
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
      // Value on top of Created Bar
      doc.fillColor(darkBlue).fontSize(9).font('Helvetica-Bold').text(String(created), xCenter - barW - 4, barYCreated - 12, { align: 'center', width: barW });

      // Resolved Bar (teal color)
      doc.rect(xCenter + 4, barYResolved, barW, hResolved).fill(tealColor);
      // Value on top of Resolved Bar
      doc.fillColor(tealColor).fontSize(9).font('Helvetica-Bold').text(String(resolved), xCenter + 4, barYResolved - 12, { align: 'center', width: barW });

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
    doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('Current Opened Tickets', 40, 360);

    const backlogTableY = 385;
    const drawBacklogTableHeader = (y: number) => {
      doc.rect(40, y, 515, 20).fill(tealColor);
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      doc.text('Case #', 46, y + 6, { width: 60, lineBreak: false });
      doc.text('Client', 110, y + 6, { width: 90, lineBreak: false });
      doc.text('Subject / Title', 205, y + 6, { width: 170, lineBreak: false });
      doc.text('Created On', 380, y + 6, { width: 65, align: 'center', lineBreak: false });
      doc.text('Age (Days)', 450, y + 6, { width: 50, align: 'center', lineBreak: false });
      doc.text('Status', 505, y + 6, { width: 45, align: 'center', lineBreak: false });
    };

    /**
     * Manually clamp text to fit within maxWidth using doc.widthOfString().
     * PDFKit's ellipsis option only truncates when text wraps to a new line,
     * NOT when a single long line overflows horizontally. This helper does it correctly.
     */
    const clampText = (text: string, maxWidth: number, fontName: string, fontSize: number): string => {
      doc.fontSize(fontSize).font(fontName);
      if (doc.widthOfString(text) <= maxWidth) return text;
      const ellipsis = '\u2026'; // …
      let lo = 0;
      let hi = text.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (doc.widthOfString(text.slice(0, mid) + ellipsis) <= maxWidth) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      return text.slice(0, lo) + ellipsis;
    };

    drawBacklogTableHeader(backlogTableY);

    let blY = backlogTableY + 20;
    let blZebra = false;

    if (data.backlog.length === 0) {
      doc.rect(40, blY, 515, 30).strokeColor(borderGray).lineWidth(0.5).stroke();
      doc.fillColor(textGray).fontSize(8).font('Helvetica').text('No open backlog cases found! Outstanding job.', 50, blY + 10, { align: 'center', width: 495 });
    } else {
      data.backlog.forEach((c) => {
        // Check if we need to add a new page
        if (blY > 730) {
          doc.addPage();
          drawPageHeader('Current Opened Tickets (Cont.)');
          drawBacklogTableHeader(130);
          blY = 150;
        }

        if (blZebra) {
          doc.rect(40, blY, 515, 20).fill('#F9FAFB');
        }
        doc.rect(40, blY, 515, 20).strokeColor(borderGray).lineWidth(0.5).stroke();

        // Render each cell with manually clamped text so nothing ever wraps into the next row
        doc.fillColor('#1A202C').fontSize(8).font('Helvetica-Bold');
        doc.text(clampText(c.caseNumber, 58, 'Helvetica-Bold', 8), 46, blY + 6, { lineBreak: false });

        doc.font('Helvetica').fillColor(textGray);
        doc.text(clampText(c.clientName, 88, 'Helvetica', 8), 110, blY + 6, { lineBreak: false });
        doc.text(clampText(c.subject, 168, 'Helvetica', 8), 205, blY + 6, { lineBreak: false });
        doc.text(c.createdOn, 380, blY + 6, { width: 65, align: 'center', lineBreak: false });

        // Highlight age: dark red if > 30 days
        const isOld = c.ageDays > 30;
        doc.fillColor(isOld ? '#DC2626' : textGray).font(isOld ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(String(c.ageDays), 450, blY + 6, { width: 50, align: 'center', lineBreak: false });

        doc.fillColor(textGray).font('Helvetica');
        doc.text(clampText(c.status, 43, 'Helvetica', 8), 505, blY + 6, { width: 45, align: 'center', lineBreak: false });

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

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT PORTAL PDF - Only client-visible data (mirrors dashboard)
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientPortalPdfData {
  month: number;
  year: number;
  monthName: string;
  clientInfo: {
    client_name: string;
    account_manager: string;
    customer_success_mgr: string;
    tool_version: string;
    contract_start_date: string | null;
    contract_end_date: string | null;
  };
  hoursDetails: {
    totalContracted: number;
    previousBalance: number;
    hoursConsumed: number;
    hoursOnOpen: number;
    currentBalance: number;
  };
  ticketSummary: {
    totalOpened: number;
    totalClosed: number;
    pending: number;
  };
  openCases: Array<{
    sno: number;
    case_number: string;
    contact: string;
    subject: string;
    created_on: string | null;
    hours: number;
    consultant: string;
    status: string;
  }>;
  resolvedCases: Array<{
    sno: number;
    case_number: string;
    contact: string;
    subject: string;
    created_on: string | null;
    resolved_on: string | null;
    consultant: string;
    hours: number;
  }>;
}

/** Generates a branded, client-facing PDF report with only dashboard-visible data */
export async function generateClientPortalPdf(data: ClientPortalPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Portrait A4, NO bufferPages - bottom margin of 20 avoids auto-pagination blank pages
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 20, left: 40, right: 40 },
    });

    const buffers: Buffer[] = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // ── Constants ──────────────────────────────────────────────────────────
    const PW        = 595.28;   // A4 portrait width
    const PH        = 841.89;   // A4 portrait height
    const ML        = 40;       // left margin
    const MR        = 40;       // right margin
    const tableW    = PW - ML - MR;          // 515.28
    const footerY   = PH - 50;              // 791.89
    const pageBottom = footerY - 10;        // stop adding rows before footer

    const ink        = '#111318';
    const red        = '#E8363D';
    const deepBlue   = '#1B3A5C';
    const teal       = '#006B7B';
    const textGray   = '#4B5568';
    const borderGray = '#E8ECF4';
    const lightBg    = '#F7F8FC';
    const green      = '#059669';

    const MIN_ROW_H  = 20;
    const CELL_PAD_V = 8;   // total vertical padding per row (4 top + 4 bottom)

    let pageNum = 1;

    const formatDate = (d: string | null) => (d ? dayjs(d).format('DD MMM YYYY') : '-');

    // ── drawHeader - portrait ──
    const drawHeader = (title: string) => {
      doc.rect(0, 0, PW, 50).fill(ink);
      doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold')
        .text('DYNAMICS ', ML, 18, { continued: true })
        .fillColor(red).text('SQUARE™');
      doc.fillColor('#AAAAAA').fontSize(8).font('Helvetica')
        .text('CLIENT SUPPORT REPORT', PW - MR - 160, 20, { align: 'right', width: 160 });
      doc.fillColor(ink).fontSize(16).font('Helvetica-Bold').text(title, ML, 70);
      doc.fontSize(9).font('Helvetica').fillColor(textGray)
        .text(`${data.monthName} ${data.year}  ·  ${data.clientInfo.client_name}`, ML, 90);
      doc.moveTo(ML, 106).lineTo(PW - MR, 106).strokeColor(borderGray).lineWidth(1).stroke();
    };

    // ── drawFooter - portrait inline ──
    const drawFooter = () => {
      doc.moveTo(ML, footerY).lineTo(PW - MR, footerY).strokeColor(borderGray).lineWidth(0.5).stroke();
      doc.fillColor('#9CA3AF').fontSize(8).font('Helvetica')
        .text('Dynamics Square Support Report - Confidential', ML, footerY + 6, { lineBreak: false })
        .text(`Page ${pageNum}`, PW - MR - 80, footerY + 6, { align: 'right', width: 80, lineBreak: false });
    };

    // ── Helper: start a new continuation page ──
    const addContinuationPage = (title: string) => {
      drawFooter();
      doc.addPage();
      pageNum++;
      drawHeader(title);
    };

    // ══════════════════════════════════════════════════════════════════════
    // PAGE 1: COVER
    // ══════════════════════════════════════════════════════════════════════
    doc.rect(0, 0, PW, PH).fill(ink);
    doc.rect(0, 0, 15, PH).fill(red);
    doc.rect(580, 0, 15, PH).fill(deepBlue);
    doc.rect(60, 80, 16, 16).fill(red);
    doc.rect(80, 80, 16, 16).fill('rgba(255,255,255,0.4)');
    doc.rect(60, 100, 16, 16).fill('rgba(255,255,255,0.4)');
    doc.rect(80, 100, 16, 16).fill(red);
    doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold')
      .text('DYNAMICS ', 106, 88, { continued: true })
      .fillColor(red).text('SQUARE™');
    doc.fillColor('#FFFFFF').fontSize(32).font('Helvetica-Bold')
      .text('CLIENT SUPPORT', 60, 230)
      .fillColor(red).text('PERFORMANCE', 60, 272)
      .fillColor('#FFFFFF').text('REPORT', 60, 314);
    doc.moveTo(60, 368).lineTo(300, 368).strokeColor(red).lineWidth(4).stroke();
    doc.fillColor('#E2E8F0').fontSize(20).font('Helvetica-Bold').text(data.clientInfo.client_name, 60, 398);
    doc.fillColor('#94A3B8').fontSize(14).font('Helvetica').text(`${data.monthName} ${data.year}`, 60, 428);
    const coverInfoRows: [string, string][] = [];
    if (data.clientInfo.account_manager) {
      coverInfoRows.push(['Account Manager', data.clientInfo.account_manager]);
    }
    if (data.clientInfo.customer_success_mgr) {
      coverInfoRows.push(['Customer Success Manager', data.clientInfo.customer_success_mgr]);
    }
    if (data.clientInfo.tool_version) {
      coverInfoRows.push(['Solution', data.clientInfo.tool_version]);
    }
    coverInfoRows.push(['Report Generated On', dayjs().format('DD MMM YYYY, HH:mm')]);

    const cardHeight = 28 + coverInfoRows.length * 22;
    doc.rect(60, 498, 430, cardHeight).fill('#1A202C');
    doc.rect(60, 498, 430, cardHeight).strokeColor('#2D3748').lineWidth(1).stroke();

    let infoY = 514;
    coverInfoRows.forEach(([label, value]) => {
      doc.fillColor('#94A3B8').fontSize(8).font('Helvetica-Bold').text(label, 80, infoY);
      doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica').text(value, 272, infoY, { width: 200 });
      infoY += 22;
    });
    // No footer on cover page

    // ══════════════════════════════════════════════════════════════════════
    // PAGE 2: ACCOUNT DETAILS + HOURS + TICKET SUMMARY
    // ══════════════════════════════════════════════════════════════════════
    doc.addPage(); pageNum++;
    drawHeader('Account Overview & Hours Summary');
    let y = 122;

    doc.rect(ML, y, tableW, 22).fill(deepBlue);
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold').text('ACCOUNT DETAILS', ML + 10, y + 7);
    y += 22;
    const accountRows: [string, string][] = [];
    if (data.clientInfo.client_name) {
      accountRows.push(['Client Name', data.clientInfo.client_name]);
    }
    if (data.clientInfo.account_manager) {
      accountRows.push(['Account Manager', data.clientInfo.account_manager]);
    }
    if (data.clientInfo.customer_success_mgr) {
      accountRows.push(['Customer Success Manager', data.clientInfo.customer_success_mgr]);
    }
    if (data.clientInfo.tool_version) {
      accountRows.push(['Solution', data.clientInfo.tool_version]);
    }
    if (data.clientInfo.contract_start_date) {
      accountRows.push(['Contract Start Date', formatDate(data.clientInfo.contract_start_date)]);
    }
    if (data.clientInfo.contract_end_date) {
      accountRows.push(['Contract End Date', formatDate(data.clientInfo.contract_end_date)]);
    }
    let zebra = false;
    accountRows.forEach(([label, value]) => {
      if (zebra) doc.rect(ML, y, tableW, 20).fill(lightBg);
      doc.rect(ML, y, tableW, 20).strokeColor(borderGray).lineWidth(0.5).stroke();
      doc.fillColor(textGray).fontSize(9).font('Helvetica-Bold').text(label, ML + 10, y + 6, { width: 220 });
      doc.fillColor(ink).font('Helvetica').text(value, ML + 240, y + 6, { width: 260 });
      y += 20; zebra = !zebra;
    });

    y += 14;
    doc.rect(ML, y, tableW, 22).fill(teal);
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold').text('HOURS DETAILS', ML + 10, y + 7);
    y += 22;
    const hoursRows: [string, number, boolean][] = [
      ['Total Contracted Hours',         data.hoursDetails.totalContracted,  false],
      ['Previous Balance Hours',         data.hoursDetails.previousBalance,  false],
      ['Hours Consumed This Month',      data.hoursDetails.hoursConsumed,    false],
      ['Hours Allotted to Open Tickets', data.hoursDetails.hoursOnOpen,      false],
      ['Current Balance Hours',          data.hoursDetails.currentBalance,   true],
    ];
    zebra = false;
    hoursRows.forEach(([label, value, isBalance]) => {
      const isNeg = value < 0;
      const rowFill = isBalance ? (isNeg ? '#FEF2F2' : '#ECFDF5') : (zebra ? lightBg : '#FFFFFF');
      doc.rect(ML, y, tableW, 22).fill(rowFill);
      if (isBalance) doc.rect(ML, y, 4, 22).fill(isNeg ? red : green);
      doc.rect(ML, y, tableW, 22).strokeColor(borderGray).lineWidth(0.5).stroke();
      doc.fillColor(isBalance ? (isNeg ? red : green) : textGray)
        .fontSize(9).font('Helvetica-Bold').text(label, ML + 10, y + 7, { width: 300 });
      doc.fillColor(isBalance ? (isNeg ? red : green) : ink)
        .fontSize(isBalance ? 11 : 9).font('Helvetica-Bold')
        .text(value.toFixed(2), ML, y + 6, { width: tableW - 10, align: 'right' });
      y += 22; zebra = !zebra;
    });

    y += 18;
    doc.fillColor(ink).fontSize(12).font('Helvetica-Bold').text('Ticket Summary', ML, y);
    y += 16;
    const summaryCards = [
      { label: 'Tickets\nOpened', val: data.ticketSummary.totalOpened, color: '#3182CE', bg: '#EBF8FF' },
      { label: 'Tickets\nClosed',  val: data.ticketSummary.totalClosed,  color: green,     bg: '#ECFDF5' },
      { label: 'Pending\nTickets', val: data.ticketSummary.pending,      color: '#DD6B20', bg: '#FFFAF0' },
    ];
    const cW = 160; const cH = 64;
    summaryCards.forEach((c, idx) => {
      const cx = ML + idx * (cW + 17);
      doc.rect(cx, y, cW, cH).fill(c.bg);
      doc.rect(cx, y, cW, 4).fill(c.color);
      doc.fillColor(textGray).fontSize(8.5).font('Helvetica-Bold').text(c.label, cx + 8, y + 10, { width: cW - 16 });
      doc.fillColor('#1A202C').fontSize(22).font('Helvetica-Bold').text(String(c.val), cx + 8, y + 34, { width: cW - 16 });
    });

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════
    // PAGE 3: OPEN TICKETS  (Portrait - dynamic row height via heightOfString)
    // ══════════════════════════════════════════════════════════════════════
    // Portrait column layout (x: 44..555, available 511px):
    // # | CaseNo | Contact | Subject(wide) | Created | Hrs | Status
    const openCols = {
      sno:     { x: 44,  w: 15  },
      caseNo:  { x: 62,  w: 70  },
      contact: { x: 135, w: 65  },
      subject: { x: 203, w: 185 },
      created: { x: 391, w: 52  },
      hrs:     { x: 446, w: 22  },
      status:  { x: 471, w: 84  },
    };


    doc.addPage(); pageNum++;
    drawHeader('Open Tickets Report');

    const drawOpenHeader = (ty: number) => {
      doc.rect(ML, ty, tableW, 22).fill(deepBlue);
      doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold');
      doc.text('#',        openCols.sno.x,     ty + 7, { width: openCols.sno.w,     align: 'center', lineBreak: false });
      doc.text('Case No.', openCols.caseNo.x,  ty + 7, { width: openCols.caseNo.w,  lineBreak: false });
      doc.text('Contact',  openCols.contact.x, ty + 7, { width: openCols.contact.w, lineBreak: false });
      doc.text('Subject',  openCols.subject.x, ty + 7, { width: openCols.subject.w, lineBreak: false });
      doc.text('Created',  openCols.created.x, ty + 7, { width: openCols.created.w, align: 'center', lineBreak: false });
      doc.text('Hrs',      openCols.hrs.x,     ty + 7, { width: openCols.hrs.w,     align: 'center', lineBreak: false });
      doc.text('Status',   openCols.status.x,  ty + 7, { width: openCols.status.w,  align: 'center', lineBreak: false });
    };

    let tblY = 122;
    drawOpenHeader(tblY); tblY += 22;
    let rz = false;

    if (data.openCases.length === 0) {
      doc.rect(ML, tblY, tableW, 28).strokeColor(borderGray).lineWidth(0.5).stroke();
      doc.fillColor(textGray).fontSize(9).font('Helvetica')
        .text('No open tickets for this period.', ML, tblY + 9, { align: 'center', width: tableW });
    } else {
      data.openCases.forEach((c) => {
        const subjectText = c.subject || '-';

        // ── Measure actual rendered height before drawing ──
        doc.fontSize(7.5).font('Helvetica');
        const subjectH = doc.heightOfString(subjectText, { width: openCols.subject.w });
        const statusH = doc.heightOfString(c.status || '-', { width: openCols.status.w });
        const contactH = doc.heightOfString(c.contact || '-', { width: openCols.contact.w });
        const maxTextH = Math.max(subjectH, statusH, contactH);
        const rowH = Math.max(MIN_ROW_H, Math.ceil(maxTextH) + CELL_PAD_V);

        // New page if row won't fit
        if (tblY + rowH > pageBottom) {
          addContinuationPage('Open Tickets Report (Cont.)');
          tblY = 122; drawOpenHeader(tblY); tblY += 22; rz = false;
        }

        // Background + border drawn with correct height
        if (rz) doc.rect(ML, tblY, tableW, rowH).fill(lightBg);
        doc.rect(ML, tblY, tableW, rowH).strokeColor(borderGray).lineWidth(0.5).stroke();

        // Vertical center for single-line cells
        const midY = tblY + (rowH - 8) / 2;

        // Draw all single-line cells first (lineBreak:false keeps cursor in place)
        doc.fillColor(textGray).fontSize(7.5).font('Helvetica')
          .text(String(c.sno),             openCols.sno.x,     midY, { width: openCols.sno.w,     align: 'center', lineBreak: false });
        doc.fillColor('#1A202C').font('Helvetica-Bold')
          .text(c.case_number || '-',      openCols.caseNo.x,  midY, { width: openCols.caseNo.w,  lineBreak: false });
        doc.fillColor(textGray).font('Helvetica')
          .text(c.contact || '-',          openCols.contact.x, midY, { width: openCols.contact.w, lineBreak: false, ellipsis: true })
          .text(formatDate(c.created_on),  openCols.created.x, midY, { width: openCols.created.w, align: 'center', lineBreak: false })
          .text((c.hours || 0).toFixed(2), openCols.hrs.x,     midY, { width: openCols.hrs.w,     align: 'center', lineBreak: false })
          .text(c.status || '-',           openCols.status.x,  midY, { width: openCols.status.w,  align: 'center', lineBreak: false, ellipsis: true });

        // Draw subject LAST (may wrap - drawn at top of cell, not centered)
        doc.fillColor(ink).fontSize(7.5).font('Helvetica')
          .text(subjectText, openCols.subject.x, tblY + CELL_PAD_V / 2,
                { width: openCols.subject.w, lineBreak: true });

        tblY += rowH;
        rz = !rz;
      });
    }

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════
    // PAGE 4: RESOLVED TICKETS  (Portrait - dynamic row height)
    // ══════════════════════════════════════════════════════════════════════
    // #(16) | CaseNo(86) | Contact(62) | Subject(162) | Created(60) | Resolved(60) | Hrs(28)
    const resolvedCols = {
      sno:      { x: 44,  w: 16  },
      caseNo:   { x: 62,  w: 88  },
      contact:  { x: 153, w: 70  },
      subject:  { x: 226, w: 172 },
      created:  { x: 401, w: 60  },
      resolved: { x: 464, w: 60  },
      hrs:      { x: 527, w: 28  },
    };

    doc.addPage(); pageNum++;
    drawHeader('Resolved Tickets Report');

    const drawResolvedHeader = (ty: number) => {
      doc.rect(ML, ty, tableW, 22).fill(teal);
      doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold');
      doc.text('#',         resolvedCols.sno.x,      ty + 7, { width: resolvedCols.sno.w,      align: 'center', lineBreak: false });
      doc.text('Case No.',  resolvedCols.caseNo.x,   ty + 7, { width: resolvedCols.caseNo.w,   lineBreak: false });
      doc.text('Contact',   resolvedCols.contact.x,  ty + 7, { width: resolvedCols.contact.w,  lineBreak: false });
      doc.text('Subject',   resolvedCols.subject.x,  ty + 7, { width: resolvedCols.subject.w,  lineBreak: false });
      doc.text('Created',   resolvedCols.created.x,  ty + 7, { width: resolvedCols.created.w,  align: 'center', lineBreak: false });
      doc.text('Resolved',  resolvedCols.resolved.x, ty + 7, { width: resolvedCols.resolved.w, align: 'center', lineBreak: false });
      doc.text('Hrs',       resolvedCols.hrs.x,      ty + 7, { width: resolvedCols.hrs.w,      align: 'center', lineBreak: false });
    };

    tblY = 122;
    drawResolvedHeader(tblY); tblY += 22; rz = false;

    if (data.resolvedCases.length === 0) {
      doc.rect(ML, tblY, tableW, 28).strokeColor(borderGray).lineWidth(0.5).stroke();
      doc.fillColor(textGray).fontSize(9).font('Helvetica')
        .text('No resolved tickets for this period.', ML, tblY + 9, { align: 'center', width: tableW });
    } else {
      data.resolvedCases.forEach((c) => {
        const subjectText = c.subject || '-';

        // ── Measure actual height ──
        doc.fontSize(7.5).font('Helvetica');
        const subjectH = doc.heightOfString(subjectText, { width: resolvedCols.subject.w });
        const contactH = doc.heightOfString(c.contact || '-', { width: resolvedCols.contact.w });
        const maxTextH = Math.max(subjectH, contactH);
        const rowH = Math.max(MIN_ROW_H, Math.ceil(maxTextH) + CELL_PAD_V);

        if (tblY + rowH > pageBottom) {
          addContinuationPage('Resolved Tickets Report (Cont.)');
          tblY = 122; drawResolvedHeader(tblY); tblY += 22; rz = false;
        }

        if (rz) doc.rect(ML, tblY, tableW, rowH).fill(lightBg);
        doc.rect(ML, tblY, tableW, rowH).strokeColor(borderGray).lineWidth(0.5).stroke();

        const midY = tblY + (rowH - 8) / 2;

        // Single-line cells first
        doc.fillColor(textGray).fontSize(7.5).font('Helvetica')
          .text(String(c.sno),              resolvedCols.sno.x,      midY, { width: resolvedCols.sno.w,      align: 'center', lineBreak: false });
        doc.fillColor('#1A202C').font('Helvetica-Bold')
          .text(c.case_number || '-',       resolvedCols.caseNo.x,   midY, { width: resolvedCols.caseNo.w,   lineBreak: false });
        doc.fillColor(textGray).font('Helvetica')
          .text(c.contact || '-',           resolvedCols.contact.x,  midY, { width: resolvedCols.contact.w,  lineBreak: false, ellipsis: true })
          .text(formatDate(c.created_on),   resolvedCols.created.x,  midY, { width: resolvedCols.created.w,  align: 'center', lineBreak: false })
          .text(formatDate(c.resolved_on),  resolvedCols.resolved.x, midY, { width: resolvedCols.resolved.w, align: 'center', lineBreak: false })
          .text((c.hours || 0).toFixed(2),  resolvedCols.hrs.x,      midY, { width: resolvedCols.hrs.w,      align: 'center', lineBreak: false });

        // Subject last - wraps cleanly within its column
        doc.fillColor(ink).fontSize(7.5).font('Helvetica')
          .text(subjectText, resolvedCols.subject.x, tblY + CELL_PAD_V / 2,
                { width: resolvedCols.subject.w, lineBreak: true });

        tblY += rowH;
        rz = !rz;
      });
    }

    drawFooter();

    doc.end();
  });
}
