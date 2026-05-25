import mongoose, { Document, Schema } from 'mongoose';

export interface IMonthlyReportSetting extends Document {
  report_type: 'monthly' | 'bi-weekly';
  is_enabled: boolean;
  recipient_emails: string[];
  cc_emails: string[];
  send_day: number;        // Day of the month to send (1-28)
  send_time: string;       // HH:mm in UTC
  send_timezone: string;   // IANA timezone, e.g. 'Asia/Kolkata'
  last_sent_month: number | null; // 1-12
  last_sent_year: number | null;  // YYYY
  createdAt: Date;
  updatedAt: Date;
}

const MonthlyReportSettingSchema = new Schema(
  {
    report_type: { type: String, enum: ['monthly', 'bi-weekly'], default: 'monthly' },
    is_enabled: { type: Boolean, default: false },
    recipient_emails: { type: [String], default: [] },
    cc_emails: { type: [String], default: [] },
    send_day: { type: Number, default: 1, min: 1, max: 28 }, // 1st to 28th
    send_time: { type: String, default: '09:00' },          // HH:mm
    send_timezone: { type: String, default: 'Asia/Kolkata' },
    last_sent_month: { type: Number, default: null },
    last_sent_year: { type: Number, default: null },
  },
  { timestamps: true }
);

export const MonthlyReportSetting = mongoose.model<IMonthlyReportSetting>('MonthlyReportSetting', MonthlyReportSettingSchema);
