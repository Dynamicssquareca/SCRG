import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  email: string;
  password_hash: string;
  full_name: string;
  role: string;
  client_id: mongoose.Types.ObjectId | null;
  is_active: boolean;
  totp_secret?: string;
  totp_enabled: boolean;
  totp_recovery_code?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    full_name: { type: String, required: true },
    role: { type: String, required: true, default: 'operator' },
    client_id: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    is_active: { type: Boolean, default: true },
    totp_secret: { type: String },
    totp_enabled: { type: Boolean, default: false },
    totp_recovery_code: { type: String },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function () {
  if (!this.isModified('password_hash')) return;
  const salt = await bcrypt.genSalt(12);
  this.password_hash = await bcrypt.hash(this.password_hash as string, salt);
});

export const User = mongoose.model<IUser>('User', UserSchema);
