import mongoose from 'mongoose';
import { env } from '../config/env';
import { Case } from '../models/Case';
import { Client } from '../models/Client';
import { Upload } from '../models/Upload';

async function diagnoseClients() {
  await mongoose.connect(env.MONGODB_URI);

  // Get the most recent upload
  const latestUpload = await Upload.findOne().sort({ createdAt: -1 }).lean() as any;
  console.log(`\nLatest upload: ${latestUpload?._id} (status: ${latestUpload?.status}, rows: ${latestUpload?.row_count})`);

  // All active clients
  const activeClients = await Client.find({ is_active: true }).lean() as any[];
  console.log(`\nTotal active clients: ${activeClients.length}`);

  // Distinct client_ids that appear in the latest upload
  const clientIdsInUpload = await (Case as any).distinct('client_id', {
    upload_id: latestUpload?._id,
    client_id: { $ne: null }
  }) as any[];
  console.log(`Distinct client_ids in latest upload: ${clientIdsInUpload.length}`);

  // Map upload client_ids to strings for comparison
  const inUploadSet = new Set(clientIdsInUpload.map((id: any) => id.toString()));

  console.log('\n========================================');
  console.log('CLIENT COVERAGE ANALYSIS');
  console.log('========================================');

  const notInUpload: string[] = [];
  const inUpload: string[] = [];

  for (const client of activeClients) {
    const id = client._id.toString();
    if (inUploadSet.has(id)) {
      inUpload.push(client.client_name);
    } else {
      notInUpload.push(client.client_name);
    }
  }

  console.log(`\nClients IN the latest upload (${inUpload.length}):`);
  inUpload.forEach(n => console.log(`  + ${n}`));

  console.log(`\nClients NOT in the latest upload (${notInUpload.length}):`);
  console.log('(These have no rows in the uploaded sheet - their tickets are missing from the Excel file)');
  notInUpload.forEach(n => console.log(`  - ${n}`));

  // Also check if any customer_names in cases don't match any active client
  const distinctCustomerNames = await (Case as any).distinct('customer_name', {
    upload_id: latestUpload?._id
  }) as string[];
  const activeClientNames = new Set(activeClients.map((c: any) => c.client_name.toLowerCase().trim()));
  const unmatchedNames = distinctCustomerNames.filter(
    n => n && !activeClientNames.has(n.toLowerCase().trim())
  );
  if (unmatchedNames.length > 0) {
    console.log(`\nCustomer names in upload NOT matching any active client (${unmatchedNames.length}):`);
    unmatchedNames.forEach(n => console.log(`  ? "${n}"`));
  }

  await mongoose.disconnect();
}

diagnoseClients().catch(console.error);
