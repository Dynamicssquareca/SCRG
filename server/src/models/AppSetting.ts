import mongoose, { Document, Schema } from 'mongoose';

export interface IAppSetting extends Document {
  key: string;
  value: any;
  updatedAt: Date;
}

const AppSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { updatedAt: true, createdAt: false } }
);

export const AppSetting = mongoose.model<IAppSetting>('AppSetting', AppSettingSchema);
