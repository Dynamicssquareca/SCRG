import mongoose, { Document, Schema } from 'mongoose';
import { IClient } from './Client';
import { IUser } from './User';

export interface IClientReachout extends Document {
  client_id: mongoose.Types.ObjectId | IClient;
  case_number: string;
  client_user_id: mongoose.Types.ObjectId | IUser;
  assigned_to: string; // 'Customer success manager' | 'Account manager'
  comment: string;
  status: string; // 'pending' | 'resolved'
  createdAt: Date;
  updatedAt: Date;
}

const ClientReachoutSchema: Schema = new Schema(
  {
    client_id: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    case_number: { type: String, required: true },
    client_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assigned_to: { type: String, required: true, enum: ['Customer success manager', 'Account manager'] },
    comment: { type: String, required: true },
    status: { type: String, required: true, default: 'pending', enum: ['pending', 'resolved'] },
  },
  { timestamps: true }
);

export const ClientReachout = mongoose.model<IClientReachout>('ClientReachout', ClientReachoutSchema);
