import { MonthlyReportSetting } from '../models/MonthlyReportSetting';
import { getMonthlyReportData, generateMonthlyPdfReport } from './pdfReportService';
import { sendEmail } from './emailService';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import logger from '../utils/logger';

dayjs.extend(utc);
dayjs.extend(timezone);

/** 
 * forceMode = true  → skip ALL checks (used for manual test-send from UI)
 * cronMode  = true  → skip time-window check only; keep day check + duplicate guard
 *                     (used by cron-job.org — it controls timing, app controls the day)
 */
export async function processMonthlyReports(forceMode: boolean = false, cronMode: boolean = false) {
  logger.debug('Starting automated monthly and bi-weekly PDF report scheduler check...');
  
  // 1. Process Monthly Support Report
  await processReportByType('monthly', forceMode, cronMode);

  // 2. Process Bi-Weekly Support Report
  await processReportByType('bi-weekly', forceMode, cronMode);
}

/** Processes a specific support report type (monthly or bi-weekly) */
async function processReportByType(reportType: 'monthly' | 'bi-weekly', forceMode: boolean = false, cronMode: boolean = false) {
  const isBiWeekly = reportType === 'bi-weekly';
  const label = isBiWeekly ? 'bi-weekly' : 'monthly';

  try {
    const settings = await MonthlyReportSetting.findOne({ report_type: reportType, is_enabled: true });
    if (!settings) {
      logger.debug(`Support report scheduler for ${label} is disabled or not configured.`);
      return;
    }

    if (settings.recipient_emails.length === 0) {
      logger.warn(`Support report scheduler for ${label} is enabled but has no recipient emails configured.`);
      return;
    }

    // Anchor time in configured timezone (for day-of-month check)
    const tzTime = dayjs().tz(settings.send_timezone || 'Asia/Kolkata');
    const currentDay = tzTime.date();

    // send_time is stored in UTC (UI converts local→UTC before saving)
    // Compare scheduled UTC time against current UTC time
    const utcNow = dayjs().utc();
    const currentUtcHHmm = utcNow.format('HH:mm');

    // Calculate report target period
    // Monthly: full previous completed calendar month
    // Bi-weekly: first half of the current calendar month (1st-14th)
    const targetMonthDate = isBiWeekly ? tzTime : tzTime.subtract(1, 'month');
    const reportMonth = targetMonthDate.month() + 1; // 1-12
    const reportYear = targetMonthDate.year();

    if (!forceMode) {
      // 1. Always check if today matches the scheduled send_day (e.g. 1 or 15)
      if (currentDay !== settings.send_day) {
        logger.debug(`Today is day ${currentDay}, scheduled for day ${settings.send_day} (${label}). Skipping.`);
        return;
      }

      // 2. Time check — send_time stored as UTC HH:mm
      if (cronMode) {
        // Under hourly cron triggers, check if current UTC hour matches the scheduled UTC hour
        const [sh] = settings.send_time.split(':').map(Number);
        const ch = utcNow.hour();
        if (ch !== sh) {
          logger.debug(`Current UTC hour is ${ch}, scheduled UTC hour is ${sh} (${label}). Skipping.`);
          return;
        }
      } else {
        // Under high-frequency local checks, check within a 9-minute window against UTC
        const [sh, sm] = settings.send_time.split(':').map(Number);
        const [ch, cm] = currentUtcHHmm.split(':').map(Number);
        const diffMinutes = Math.abs((ch * 60 + cm) - (sh * 60 + sm));

        if (diffMinutes > 9) {
          return;
        }
      }

      // 3. Prevent duplicate sends for the same period
      if (settings.last_sent_month === reportMonth && settings.last_sent_year === reportYear) {
        logger.debug(`Support report (${label}) for ${reportMonth}/${reportYear} already sent. Skipping.`);
        return;
      }
    }


    logger.info(`Triggering ${label} support report distribution for ${reportMonth}/${reportYear}...`);

    // Generate PDF
    const data = await getMonthlyReportData(reportMonth, reportYear, isBiWeekly);
    const pdfBuffer = await generateMonthlyPdfReport(data, isBiWeekly);

    const monthName = dayjs().month(reportMonth - 1).format('MMMM');
    const monthNameShort = dayjs().month(reportMonth - 1).format('MMM');
    
    const subject = isBiWeekly
      ? `Dynamics Square Support Bi-Weekly Report (1st-14th): ${monthName} ${reportYear}`
      : `Dynamics Square Operations & Support Monthly Report: ${monthName} ${reportYear}`;

    const fileName = isBiWeekly
      ? `Support_BiWeekly_Report_${monthNameShort}_${reportYear}.pdf`
      : `Support_Monthly_Report_${monthNameShort}_${reportYear}.pdf`;

    const bodyLabel = isBiWeekly ? 'Bi-Weekly Support (01-14)' : 'Monthly Operations & Support';
    const periodDesc = isBiWeekly ? `${monthName} 01 - 14, ${reportYear}` : `${monthName} ${reportYear}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1b3a5c; margin-top: 0;">Dynamics Square ${bodyLabel} Report</h2>
        <p>Hello Team,</p>
        <p>Please find attached the performance and consumption support report for the period of <strong>${periodDesc}</strong>.</p>
        <p>This report contains key performance metrics, comparison trends, client-wise usage logs, and backlog age tracking.</p>
        <br />
        <p style="font-size: 13px; color: #4a5568;">Sincerely,<br/><strong>Dynamics Square Support Operations</strong></p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 11px; color: #a0aec0; text-align: center;">This is an automated transmission. Please do not reply directly to this mail.</p>
      </div>
    `;

    // Send the email
    await sendEmail({
      to: settings.recipient_emails,
      cc: settings.cc_emails,
      subject,
      html,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    // Update settings to prevent re-sending
    settings.last_sent_month = reportMonth;
    settings.last_sent_year = reportYear;
    await settings.save();

    logger.info(`Successfully dispatched ${label} report for ${reportMonth}/${reportYear} to recipients.`);
  } catch (err) {
    logger.error(`Error occurred in ${label} report scheduler job:`, err);
  }
}
