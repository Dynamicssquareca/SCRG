import { Request, Response, NextFunction } from 'express';
import { MonthlyReportSetting } from '../models/MonthlyReportSetting';
import { getMonthlyReportData, generateMonthlyPdfReport } from '../services/pdfReportService';
import { sendEmail } from '../services/emailService';
import { successResponse } from '../utils/apiResponse';
import { User } from '../models/User';
import { ReminderSetting } from '../models/ReminderSetting';
import dayjs from 'dayjs';

/** GET /dashboard/report/recipient-suggestions — Fetches previously used/registered email addresses */
export async function getRecipientSuggestions(req: Request, res: Response, next: NextFunction) {
  try {
    const emailSet = new Set<string>();

    // 1. Fetch from Users
    const users = await User.find({}, 'email');
    users.forEach(u => {
      if (u.email) emailSet.add(u.email.trim().toLowerCase());
    });

    // 2. Fetch from MonthlyReportSetting
    const reportSettings = await MonthlyReportSetting.find({}, 'recipient_emails cc_emails');
    reportSettings.forEach(rs => {
      if (rs.recipient_emails) {
        rs.recipient_emails.forEach(e => emailSet.add(e.trim().toLowerCase()));
      }
      if (rs.cc_emails) {
        rs.cc_emails.forEach(e => emailSet.add(e.trim().toLowerCase()));
      }
    });

    // 3. Fetch from ReminderSetting
    const reminderSettings = await ReminderSetting.find({}, 'recipient_emails cc_emails');
    reminderSettings.forEach(rem => {
      if (rem.recipient_emails) {
        rem.recipient_emails.forEach(e => emailSet.add(e.trim().toLowerCase()));
      }
      if (rem.cc_emails) {
        rem.cc_emails.forEach(e => emailSet.add(e.trim().toLowerCase()));
      }
    });

    const suggestions = Array.from(emailSet).sort();
    successResponse(res, suggestions);
  } catch (err) {
    next(err);
  }
}

/** POST /dashboard/report/recipient-suggestions/remove — Removes an email suggestion from all settings records */
export async function removeRecipientSuggestion(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const targetEmail = email.trim().toLowerCase();

    // 1. Remove from all MonthlyReportSetting
    const reportSettings = await MonthlyReportSetting.findOne();
    if (reportSettings) {
      reportSettings.recipient_emails = (reportSettings.recipient_emails || []).filter(
        e => e.trim().toLowerCase() !== targetEmail
      );
      reportSettings.cc_emails = (reportSettings.cc_emails || []).filter(
        e => e.trim().toLowerCase() !== targetEmail
      );
      await reportSettings.save();
    }

    // 2. Remove from all ReminderSetting
    const reminderSettings = await ReminderSetting.find({
      $or: [
        { recipient_emails: { $in: [new RegExp(`^${targetEmail}$`, 'i')] } },
        { cc_emails: { $in: [new RegExp(`^${targetEmail}$`, 'i')] } }
      ]
    });

    for (const rem of reminderSettings) {
      rem.recipient_emails = (rem.recipient_emails || []).filter(
        e => e.trim().toLowerCase() !== targetEmail
      );
      rem.cc_emails = (rem.cc_emails || []).filter(
        e => e.trim().toLowerCase() !== targetEmail
      );
      await rem.save();
    }

    successResponse(res, { message: 'Email suggestion removed successfully.' });
  } catch (err) {
    next(err);
  }
}

/** GET /dashboard/report/settings — Fetch report scheduler settings for both monthly & bi-weekly */
export async function getReportSettings(req: Request, res: Response, next: NextFunction) {
  try {
    let monthly = await MonthlyReportSetting.findOne({ report_type: 'monthly' });
    if (!monthly) {
      // Create default monthly settings if none exists
      monthly = await MonthlyReportSetting.create({
        report_type: 'monthly',
        is_enabled: false,
        recipient_emails: [],
        cc_emails: [],
        send_day: 1,
        send_time: '09:00',
        send_timezone: 'Asia/Kolkata',
      });
    }

    let biweekly = await MonthlyReportSetting.findOne({ report_type: 'bi-weekly' });
    if (!biweekly) {
      // Create default bi-weekly settings if none exists
      biweekly = await MonthlyReportSetting.create({
        report_type: 'bi-weekly',
        is_enabled: false,
        recipient_emails: [],
        cc_emails: [],
        send_day: 15,
        send_time: '09:00',
        send_timezone: 'Asia/Kolkata',
      });
    }

    successResponse(res, { monthly, biweekly });
  } catch (err) {
    next(err);
  }
}

/** POST /dashboard/report/settings — Save/update report scheduler settings */
export async function saveReportSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const { report_type, is_enabled, recipient_emails, cc_emails, send_day, send_time, send_timezone } = req.body;
    const type = report_type === 'bi-weekly' ? 'bi-weekly' : 'monthly';
    
    let settings = await MonthlyReportSetting.findOne({ report_type: type });
    if (!settings) {
      settings = new MonthlyReportSetting({ report_type: type });
    }

    settings.is_enabled = !!is_enabled;
    settings.recipient_emails = Array.isArray(recipient_emails) ? recipient_emails.map((e: string) => e.trim()).filter(Boolean) : [];
    settings.cc_emails = Array.isArray(cc_emails) ? cc_emails.map((e: string) => e.trim()).filter(Boolean) : [];
    settings.send_day = Number(send_day) || (type === 'bi-weekly' ? 15 : 1);
    settings.send_time = send_time || '09:00';
    settings.send_timezone = send_timezone || 'Asia/Kolkata';

    await settings.save();
    successResponse(res, settings);
  } catch (err) {
    next(err);
  }
}

/** GET /dashboard/report/preview — Generates and streams/downloads the PDF preview */
export async function getReportPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const now = new Date();
    const month = req.query.month ? Number(req.query.month) : now.getMonth() + 1;
    const year = req.query.year ? Number(req.query.year) : now.getFullYear();
    const reportType = req.query.reportType === 'bi-weekly' ? 'bi-weekly' : 'monthly';
    const isBiWeekly = reportType === 'bi-weekly';

    const data = await getMonthlyReportData(month, year, isBiWeekly);
    const pdfBuffer = await generateMonthlyPdfReport(data, isBiWeekly);

    const monthName = dayjs().month(month - 1).format('MMM');
    const fileName = isBiWeekly
      ? `Support_BiWeekly_Report_${monthName}_${year}.pdf`
      : `Support_Monthly_Report_${monthName}_${year}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

/** POST /dashboard/report/test-send — Generates the PDF for selected month and emails it immediately */
export async function testSendReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { recipient_emails, cc_emails, month, year, report_type } = req.body;
    const reportType = report_type === 'bi-weekly' ? 'bi-weekly' : 'monthly';
    const isBiWeekly = reportType === 'bi-weekly';

    const targetMonth = month ? Number(month) : new Date().getMonth() + 1;
    const targetYear = year ? Number(year) : new Date().getFullYear();

    if (!recipient_emails || !Array.isArray(recipient_emails) || recipient_emails.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one recipient email is required.' });
    }

    const data = await getMonthlyReportData(targetMonth, targetYear, isBiWeekly);
    const pdfBuffer = await generateMonthlyPdfReport(data, isBiWeekly);

    const monthName = dayjs().month(targetMonth - 1).format('MMMM');
    
    const subject = isBiWeekly
      ? `[TEST] Dynamics Square Operations & Support Bi-Weekly Report (1st-14th): ${monthName} ${targetYear}`
      : `[TEST] Dynamics Square Operations & Support Monthly Report: ${monthName} ${targetYear}`;
    
    const reportLabel = isBiWeekly ? 'Bi-Weekly Support' : 'Monthly Support';
    const periodDesc = isBiWeekly
      ? `<strong>${monthName} 01 - 14, ${targetYear}</strong>`
      : `<strong>${monthName} ${targetYear}</strong>`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1b3a5c;">${reportLabel} Operations Report Test</h2>
        <p>Hello,</p>
        <p>This is a test transmission of the operations and support ${reportLabel.toLowerCase()} report for ${periodDesc}.</p>
        <p>Please find the generated report attached as a PDF file.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #718096;">Dynamics Square Support Report Generator</p>
      </div>
    `;

    const cleanRecipients = recipient_emails.map((e: string) => e.trim()).filter(Boolean);
    const cleanCc = Array.isArray(cc_emails) ? cc_emails.map((e: string) => e.trim()).filter(Boolean) : [];

    const monthNameShort = dayjs().month(targetMonth - 1).format('MMM');
    const fileName = isBiWeekly
      ? `Support_BiWeekly_Report_${monthNameShort}_${targetYear}.pdf`
      : `Support_Monthly_Report_${monthNameShort}_${targetYear}.pdf`;

    await sendEmail({
      to: cleanRecipients,
      cc: cleanCc,
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

    successResponse(res, { message: 'Test report sent successfully.' });
  } catch (err) {
    next(err);
  }
}
