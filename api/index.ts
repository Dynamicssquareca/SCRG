import app from '../server/src/app';
import { connectDB } from '../server/src/config/database';

// Initialize DB connection for serverless
let isConnected = false;
const connect = async () => {
  if (isConnected) return;
  await connectDB();
  isConnected = true;
};

export default async (req: any, res: any) => {
  await connect();
  return app(req, res);
};


