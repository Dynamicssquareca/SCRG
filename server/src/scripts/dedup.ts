import mongoose from 'mongoose';
import { Case } from '../models/Case';
import { env } from '../config/env';

async function run() {
  try {
    if (!env.MONGODB_URI) {
      console.error('MONGODB_URI is not defined in the environment.');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected. Deduplicating cases based on case_number...');
    
    // Aggregate to find groups of duplicate case_numbers, keeping the most recent one.
    const duplicateGroups = await Case.aggregate([
      { $sort: { updated_on: -1, createdAt: -1 } },
      { $group: {
          _id: '$case_number',
          keepId: { $first: '$_id' },
          allIds: { $push: '$_id' }
      }},
      { $match: { "allIds.1": { $exists: true } } } // Only groups with more than 1 entry
    ]);

    let totalRemoved = 0;
    console.log(`Found ${duplicateGroups.length} unique case numbers with duplicates.`);

    for (const group of duplicateGroups) {
      const idsToDelete = group.allIds.filter((id: any) => id.toString() !== group.keepId.toString());
      if (idsToDelete.length > 0) {
        const res = await Case.deleteMany({ _id: { $in: idsToDelete } });
        totalRemoved += res.deletedCount || 0;
      }
    }
    
    console.log(`Successfully removed ${totalRemoved} duplicate cases.`);
    process.exit(0);
  } catch (e) {
    console.error('An error occurred during deduplication:', e);
    process.exit(1);
  }
}

run();
