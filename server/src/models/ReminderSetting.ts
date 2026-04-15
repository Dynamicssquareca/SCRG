
import mongoose, { Document, Schema } from 'mongoose';

export interface IReminderSetting extends Document {
  client_id: mongoose.Types.ObjectId;
  is_enabled: boolean;
  reminder_days: number[];
  recipient_emails: string[];
  cc_emails: string[];
  send_time: string;     // HH:mm in send_timezone
  send_timezone: string; // IANA timezone e.g. 'Asia/Kolkata'
  last_checked_date: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ReminderSettingSchema = new Schema(
  {
    client_id: { type: Schema.Types.ObjectId, ref: 'Client', required: true, unique: true },
    is_enabled: { type: Boolean, default: false },
    reminder_days: { type: [Number], default: [30] }, // Default is 30 days based on user input
    recipient_emails: { type: [String], default: [] },
    cc_emails: { type: [String], default: [] },
    send_time: { type: String, default: '09:00' },
    send_timezone: { type: String, default: 'Asia/Kolkata' }, // IANA timezone for send_time
    last_checked_date: { type: Date, default: null },
  },
  { timestamps: true }
);

export const ReminderSetting = mongoose.model<IReminderSetting>('ReminderSetting', ReminderSettingSchema);
