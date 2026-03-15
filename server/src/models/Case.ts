import mongoose, { Document, Schema } from 'mongoose';
import { IUpload } from './Upload';
import { IClient } from './Client';

export interface ICase extends Document {
  upload_id: mongoose.Types.ObjectId | IUpload;
  client_id: mongoose.Types.ObjectId | IClient | null;
  case_number: string;
  customer_name: string;
  contact: string | null;
  created_on: Date | null;
  case_title: string | null;
  support_agent: string | null;
  status_reason: string | null;
  priority: string | null;
  country: string | null;
  billable_duration: number;
  updated_on: Date | null;
  total_days: number;
  comments: string | null;
  createdAt: Date;
}

const CaseSchema: Schema = new Schema(
  {
    upload_id: { type: Schema.Types.ObjectId, ref: 'Upload', required: true },
    client_id: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    case_number: { type: String, required: true },
    customer_name: { type: String, required: true },
    contact: { type: String, default: null },
    created_on: { type: Date, default: null },
    case_title: { type: String, default: null },
    support_agent: { type: String, default: null },
    status_reason: { type: String, default: null },
    priority: { type: String, default: null },
    country: { type: String, default: null },
    billable_duration: { type: Number, default: 0 },
    updated_on: { type: Date, default: null },
    total_days: { type: Number, default: 0 },
    comments: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Case = mongoose.model<ICase>('Case', CaseSchema);
