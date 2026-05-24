import { MonthlyReportSetting } from '../models/MonthlyReportSetting';
import { getMonthlyReportData, generateMonthlyPdfReport } from './pdfReportService';
import { sendEmail } from './emailService';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import logger from '../utils/logger';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function processMonthlyReports(forceMode: boolean = false) {
  logger.debug('Starting automated monthly PDF report scheduler check...');

  try {
    const settings = await MonthlyReportSetting.findOne({ is_enabled: true });
    if (!settings) {
      logger.debug('Monthly report scheduler is disabled or not configured.');
      return;
    }

    if (settings.recipient_emails.length === 0) {
      logger.warn('Monthly report scheduler is enabled but has no recipient emails configured.');
      return;
    }

    // Anchor time in configured timezone
    const tzTime = dayjs().tz(settings.send_timezone || 'Asia/Kolkata');
    const currentDay = tzTime.date();
    const currentHHmm = tzTime.format('HH:mm');

    // Calculate previous completed month (reporting target)
    const targetMonthDate = tzTime.subtract(1, 'month');
    const reportMonth = targetMonthDate.month() + 1; // 1-12
    const reportYear = targetMonthDate.year();

    if (!forceMode) {
      // 1. Check if today matches the scheduled send_day
      if (currentDay !== settings.send_day) {
        return;
      }

      // 2. Check if current time falls within a 10-minute window of send_time
      const [sh, sm] = settings.send_time.split(':').map(Number);
      const [ch, cm] = currentHHmm.split(':').map(Number);
      const diffMinutes = Math.abs((ch * 60 + cm) - (sh * 60 + sm));

      if (diffMinutes > 9) {
        return;
      }

      // 3. Prevent duplicate sends for the same month/year
      if (settings.last_sent_month === reportMonth && settings.last_sent_year === reportYear) {
        logger.debug(`Monthly report for ${reportMonth}/${reportYear} already sent. Skipping.`);
        return;
      }
    }

    logger.info(`Triggering monthly report distribution for ${reportMonth}/${reportYear}...`);

    // Generate PDF
    const data = await getMonthlyReportData(reportMonth, reportYear);
    const pdfBuffer = await generateMonthlyPdfReport(data);

    const monthName = dayjs().month(reportMonth - 1).format('MMMM');
    const monthNameShort = dayjs().month(reportMonth - 1).format('MMM');
    
    const subject = `Dynamics Square Operations & Support Monthly Report: ${monthName} ${reportYear}`;
    const fileName = `Support_Monthly_Report_${monthNameShort}_${reportYear}.pdf`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1b3a5c; margin-top: 0;">Dynamics Square Support & Operations Monthly Report</h2>
        <p>Hello Team,</p>
        <p>Please find attached the performance and consumption support report for the month of <strong>${monthName} ${reportYear}</strong>.</p>
        <p>This report contains key performance metrics, monthly ticket comparison trends, client-wise usage logs, and backlog age tracking.</p>
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

    logger.info(`Successfully dispatched monthly report for ${reportMonth}/${reportYear} to recipients.`);
  } catch (err) {
    logger.error('Error occurred in monthly report scheduler job:', err);
  }
}
