import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './User';

export interface IUpload extends Document {
  user_id: mongoose.Types.ObjectId | IUser;
  original_name: string;
  stored_name: string;
  file_path: string;
  file_size_bytes: number;
  row_count: number | null;
  month: number;
  year: number;
  sync_client_master: boolean;
  status: string;
  error_message: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const UploadSchema: Schema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    original_name: { type: String, required: true },
    stored_name: { type: String, required: true },
    file_path: { type: String, required: true },
    file_size_bytes: { type: Number, required: true },
    row_count: { type: Number, default: null },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    sync_client_master: { type: Boolean, default: false },
    status: { type: String, required: true, default: 'processing' },
    error_message: { type: String, default: null },
  },
  { timestamps: true }
);

export const Upload = mongoose.model<IUpload>('Upload', UploadSchema);
