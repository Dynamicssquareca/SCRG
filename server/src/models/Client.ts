import mongoose, { Document, Schema } from 'mongoose';

export interface IClient extends Document {
  client_name: string;
  account_manager: string | null;
  customer_success_mgr: string | null;
  tool_version: string | null;
  contract_start_date: Date | null;
  contract_end_date: Date | null;
  total_contracted_hours: number;
  previous_balance_hours: number;
  feedback_link: string | null;
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ClientSchema: Schema = new Schema(
  {
    client_name: { type: String, required: true, unique: true },
    account_manager: { type: String, default: null },
    customer_success_mgr: { type: String, default: null },
    tool_version: { type: String, default: null },
    contract_start_date: { type: Date, default: null },
    contract_end_date: { type: Date, default: null },
    total_contracted_hours: { type: Number, default: 0 },
    previous_balance_hours: { type: Number, default: 0 },
    feedback_link: { type: String, default: null },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Client = mongoose.model<IClient>('Client', ClientSchema);
