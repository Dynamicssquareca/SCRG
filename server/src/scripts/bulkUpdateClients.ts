import mongoose from 'mongoose';
import { Client } from '../models/Client';
import { env } from '../config/env';

async function run() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected. Updating all clients...');

    const result = await Client.updateMany(
      {}, // Match all clients
      {
        $set: {
          account_manager: 'Arish Siddiqui',
          customer_success_mgr: 'Gopal Kaushal',
        }
      }
    );

    console.log(`Successfully updated ${result.modifiedCount} clients.`);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

run();
