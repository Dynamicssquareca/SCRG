import mongoose, { Document, Schema } from 'mongoose';

export interface IReminderLog extends Document {
  client_id: mongoose.Types.ObjectId;
  days_before: number;
  sent_at: Date;
  sent_to: string[];
  status: 'sent' | 'failed';
  error: string | null;
}

const ReminderLogSchema = new Schema(
  {
    client_id: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    days_before: { type: Number, required: true },
    sent_at: { type: Date, default: Date.now },
    sent_to: { type: [String], required: true },
    status: { type: String, enum: ['sent', 'failed'], required: true },
    error: { type: String, default: null },
  }
);

// Index for deduplication checking
ReminderLogSchema.index({ client_id: 1, days_before: 1, sent_at: -1 });

export const ReminderLog = mongoose.model<IReminderLog>('ReminderLog', ReminderLogSchema);
