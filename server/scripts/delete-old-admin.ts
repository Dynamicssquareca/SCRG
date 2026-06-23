import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env from root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI!;

async function deleteOldAdmin() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const result = await mongoose.connection.collection('users').deleteMany({
    email: { $in: ['admin@dynamicssquare.in'] },
  });

  console.log(`Deleted ${result.deletedCount} old admin user(s)`);

  // Also list remaining users so you can verify
  const remaining = await mongoose.connection.collection('users').find({}, { projection: { email: 1, role: 1 } }).toArray();
  console.log('Remaining users:', remaining);

  await mongoose.disconnect();
}

deleteOldAdmin().catch(console.error);
