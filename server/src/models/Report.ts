import mongoose, { Document, Schema } from 'mongoose';
import { IClient } from './Client';
import { IUpload } from './Upload';
import { IUser } from './User';

export interface IReport extends Document {
  client_id: mongoose.Types.ObjectId | IClient;
  upload_id: mongoose.Types.ObjectId | IUpload | null;
  month: number;
  year: number;
  file_name: string | null;
  file_path: string | null;
  file_size_bytes: number | null;
  tickets_opened: number;
  tickets_closed: number;
  tickets_pending: number;
  hours_consumed: number;
  remaining_balance: number;
  status: 'draft' | 'published';
  generated_at: Date;
  generated_by: mongoose.Types.ObjectId | IUser | null;
}

const ReportSchema: Schema = new Schema(
  {
    client_id: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    upload_id: { type: Schema.Types.ObjectId, ref: 'Upload', default: null },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    file_name: { type: String, default: null },
    file_path: { type: String, default: null },
    file_size_bytes: { type: Number, default: null },
    tickets_opened: { type: Number, default: 0 },
    tickets_closed: { type: Number, default: 0 },
    tickets_pending: { type: Number, default: 0 },
    hours_consumed: { type: Number, default: 0 },
    remaining_balance: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    generated_at: { type: Date, default: Date.now },
    generated_by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  }
);

// Compound unique index analogous to the knex unique constraint
ReportSchema.index({ client_id: 1, month: 1, year: 1 }, { unique: true });

export const Report = mongoose.model<IReport>('Report', ReportSchema);
