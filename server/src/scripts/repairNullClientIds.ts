/**
 * DB Repair Script: Re-link cases with null client_id and fix duplicate clients
 * 
 * Run with: npx ts-node src/scripts/repairNullClientIds.ts
 * 
 * What it does:
 * 1. Finds all Case records where client_id is null
 * 2. Looks up the correct Client by matching customer_name
 * 3. Re-links those cases to the correct client_id
 * 4. Detects duplicate Client entries (same name, different IDs) and reports them
 */

import mongoose from 'mongoose';
import { env } from '../config/env';
import { Case } from '../models/Case';
import { Client } from '../models/Client';
import logger from '../utils/logger';

// Same normalization as dataProcessingService
function normalizeClientName(name: string): string {
  return name
    .trim()
    .replace(/[\u2019\u2018\u201B\u02BC]/g, "'")
    .replace(/[.,;:!?]+$/, '');
}

async function repairNullClientIds() {
  await mongoose.connect(env.MONGODB_URI);
  logger.info('Connected to DB');

  // ── Step 1: Find cases with null client_id ────────────────────────────────
  const nullCases = await Case.find({ client_id: null });
  logger.info(`Found ${nullCases.length} case(s) with null client_id`);

  let relinked = 0;
  let unmatched: string[] = [];

  for (const c of nullCases) {
    const rawName = (c as any).customer_name;
    if (!rawName) continue;

    const normalized = normalizeClientName(rawName);
    const escaped = normalized.replace(/[.*+?^${}()|'[\]\\]/g, '\\$&');

    const client = await Client.findOne({
      client_name: { $regex: new RegExp(`^${escaped}[.,;:!?]*$`, 'i') },
    });

    if (client) {
      await Case.updateOne({ _id: c._id }, { $set: { client_id: client._id } });
      logger.info(`  Re-linked case ${(c as any).case_number} (customer: "${rawName}") -> client "${client.client_name}" (${client._id})`);
      relinked++;
    } else {
      logger.warn(`  No matching client found for customer_name: "${rawName}"`);
      unmatched.push(rawName);
    }
  }

  logger.info(`\nRe-linked: ${relinked} / ${nullCases.length} cases`);
  if (unmatched.length > 0) {
    logger.warn(`Unmatched customer names (need manual review): ${[...new Set(unmatched)].join(', ')}`);
  }

  // ── Step 2: Detect duplicate Client entries ───────────────────────────────
  logger.info('\n-- Checking for duplicate Client entries --');
  const allClients = await Client.find({}, { client_name: 1 });
  const nameMap: Record<string, any[]> = {};

  for (const cl of allClients) {
    const key = normalizeClientName(cl.client_name).toLowerCase();
    if (!nameMap[key]) nameMap[key] = [];
    nameMap[key].push({ id: cl._id, name: cl.client_name });
  }

  let hasDuplicates = false;
  for (const [key, entries] of Object.entries(nameMap)) {
    if (entries.length > 1) {
      hasDuplicates = true;
      logger.warn(`Duplicate client entries for "${key}":`);
      entries.forEach((e: any) => logger.warn(`  - ID: ${e.id}  Name: "${e.name}"`));
    }
  }
  if (!hasDuplicates) {
    logger.info('No duplicate clients found.');
  }

  await mongoose.disconnect();
  logger.info('\nDone.');
}

repairNullClientIds().catch((err) => {
  console.error(err);
  process.exit(1);
});
