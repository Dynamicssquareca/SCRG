import mongoose from 'mongoose';
import { Client } from '../models/Client';
import { Case } from '../models/Case';
import { Report } from '../models/Report';
import logger from '../utils/logger';

const RESOLVED_STATUSES = ['resolved', 'closed', 'problem solved'];
export const closedStatusRegex = new RegExp(RESOLVED_STATUSES.join('|'), 'i');

export function isCaseResolved(status: string | null | undefined): boolean {
  if (!status) return false;
  return closedStatusRegex.test(String(status).trim());
}

export interface ClientMonthlyBalanceResult {
  totalContracted: number;
  previousBalance: number;
  hoursConsumed: number;
  hoursOnOpen: number;
  currentBalance: number;
}

/**
 * Single source of truth for monthly support hours and balance calculation for a single client.
 *
 * Rules:
 * 1. Previous Balance represents the closed-ticket balance through prior months (excluding open-ticket reservations).
 * 2. Hours Consumed represents actual hours consumed on tickets closed/resolved in this month.
 * 3. Hours on Open represents temporary allocations reserved for currently open tickets.
 * 4. Current Balance = Previous Balance - Hours Consumed This Month - Hours Allotted to Open Tickets.
 * 5. Open ticket allocations are never permanently deducted from Previous Balance in subsequent months.
 */
export async function getClientMonthlyBalance(
  clientId: string | mongoose.Types.ObjectId,
  m: number,
  y: number,
  allTime = false
): Promise<ClientMonthlyBalanceResult> {
  const clientInfo = await Client.findById(clientId);
  if (!clientInfo) {
    throw new Error('Client not found');
  }

  const totalContracted = Number(clientInfo.total_contracted_hours) || 0;
  const allCases = await Case.find({ client_id: clientId });

  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);

  // Tickets currently open (all-time open tickets for this client)
  const openCases = allCases.filter((c: any) => !isCaseResolved(c.status_reason));
  const hoursOnOpen = openCases.reduce((sum: number, c: any) => sum + (Number(c.billable_duration) || 0), 0);

  // Tickets closed/resolved in this month (or all-time if allTime is true)
  const resolvedCases = allCases.filter((c: any) => {
    if (!isCaseResolved(c.status_reason)) return false;
    if (allTime) return true;
    const updatedD = c.updated_on ? new Date(c.updated_on) : null;
    return updatedD !== null && updatedD >= monthStart && updatedD <= monthEnd;
  });

  const liveHoursConsumed = resolvedCases.reduce((sum: number, c: any) => sum + (Number(c.billable_duration) || 0), 0);

  let previousBalance: number;
  let hoursConsumed: number;

  if (allTime) {
    previousBalance = totalContracted;
    hoursConsumed = liveHoursConsumed;
  } else {
    // Find the most recent authoritative prior report before (m, y)
    const [latestPriorReport, currentReport] = await Promise.all([
      Report.findOne({
        client_id: clientId,
        $or: [
          { year: { $lt: y } },
          { year: y, month: { $lt: m } },
        ],
      })
        .sort({ year: -1, month: -1 })
        .select('month year remaining_balance hours_consumed'),
      Report.findOne({ client_id: clientId, month: m, year: y }).select('hours_consumed'),
    ]);

    if (latestPriorReport && latestPriorReport.remaining_balance != null) {
      const priorMonthEnd = new Date(latestPriorReport.year, latestPriorReport.month, 0, 23, 59, 59, 999);
      
      // If there are intervening months between latestPriorReport and this month,
      // deduct any hours consumed on cases closed in those intervening months
      const intermediateConsumed = allCases
        .filter((c: any) => {
          if (!isCaseResolved(c.status_reason)) return false;
          const updatedD = c.updated_on ? new Date(c.updated_on) : null;
          return updatedD !== null && updatedD > priorMonthEnd && updatedD < monthStart;
        })
        .reduce((sum: number, c: any) => sum + (Number(c.billable_duration) || 0), 0);

      previousBalance = Number(latestPriorReport.remaining_balance) - intermediateConsumed;
    } else {
      // Fallback when no prior report exists at all:
      // Contracted hours minus all hours consumed on cases closed before this month start
      const consumedBefore = allCases
        .filter((c: any) => {
          if (!isCaseResolved(c.status_reason)) return false;
          const updatedD = c.updated_on ? new Date(c.updated_on) : null;
          return updatedD !== null && updatedD < monthStart;
        })
        .reduce((sum: number, c: any) => sum + (Number(c.billable_duration) || 0), 0);

      previousBalance = totalContracted - consumedBefore;
    }

    hoursConsumed = currentReport && currentReport.hours_consumed != null
      ? Number(currentReport.hours_consumed)
      : liveHoursConsumed;
  }

  // Current Balance = Previous Balance - Hours Consumed - Hours Allotted to Open Tickets
  const currentBalance = allTime
    ? totalContracted - hoursConsumed - hoursOnOpen
    : previousBalance - hoursConsumed - hoursOnOpen;

  return {
    totalContracted,
    previousBalance,
    hoursConsumed,
    hoursOnOpen,
    currentBalance,
  };
}

/**
 * High-performance batch monthly balance calculator for Client Master and Management PDF reports.
 * Single round-trip queries avoid N+1 database calls.
 */
export async function getBatchClientMonthlyBalances(
  clientIds: (string | mongoose.Types.ObjectId)[],
  m: number,
  y: number
): Promise<Record<string, ClientMonthlyBalanceResult>> {
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;

  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);

  const [clients, currentReports, prevReports, latestPriorReportsAgg, openHoursAgg, liveConsumedAgg] = await Promise.all([
    Client.find({ _id: { $in: clientIds } }).select('_id total_contracted_hours previous_balance_hours'),
    Report.find({ client_id: { $in: clientIds }, month: m, year: y }).select('client_id hours_consumed remaining_balance'),
    Report.find({ client_id: { $in: clientIds }, month: prevMonth, year: prevYear }).select('client_id remaining_balance hours_consumed'),
    Report.aggregate([
      {
        $match: {
          client_id: { $in: clientIds.map(id => new mongoose.Types.ObjectId(id.toString())) },
          $or: [
            { year: { $lt: y } },
            { year: y, month: { $lt: m } },
          ],
        },
      },
      { $sort: { year: -1, month: -1 } },
      {
        $group: {
          _id: '$client_id',
          year: { $first: '$year' },
          month: { $first: '$month' },
          remaining_balance: { $first: '$remaining_balance' },
        },
      },
    ]),
    Case.aggregate([
      {
        $match: {
          client_id: { $in: clientIds.map(id => new mongoose.Types.ObjectId(id.toString())) },
          $or: [
            { status_reason: { $not: closedStatusRegex } },
            { status_reason: null },
          ],
        },
      },
      {
        $group: {
          _id: '$client_id',
          hoursOnOpen: { $sum: '$billable_duration' },
        },
      },
    ]),
    Case.aggregate([
      {
        $match: {
          client_id: { $in: clientIds.map(id => new mongoose.Types.ObjectId(id.toString())) },
          status_reason: { $regex: closedStatusRegex },
          updated_on: { $gte: monthStart, $lte: monthEnd },
        },
      },
      {
        $group: {
          _id: '$client_id',
          hoursConsumed: { $sum: '$billable_duration' },
        },
      },
    ]),
  ]);

  const currentConsumedMap: Record<string, number> = {};
  for (const r of currentReports) {
    currentConsumedMap[r.client_id.toString()] = Number(r.hours_consumed) || 0;
  }

  const liveConsumedMap: Record<string, number> = {};
  for (const row of liveConsumedAgg) {
    if (row._id) liveConsumedMap[row._id.toString()] = Number(row.hoursConsumed) || 0;
  }

  const prevReportMap: Record<string, number> = {};
  for (const r of prevReports) {
    if (r.remaining_balance != null) {
      prevReportMap[r.client_id.toString()] = Number(r.remaining_balance);
    }
  }

  const latestPriorMap: Record<string, { year: number; month: number; remaining_balance: number }> = {};
  for (const row of latestPriorReportsAgg) {
    if (row._id && row.remaining_balance != null) {
      latestPriorMap[row._id.toString()] = { year: row.year, month: row.month, remaining_balance: Number(row.remaining_balance) };
    }
  }

  const openHoursMap: Record<string, number> = {};
  for (const row of openHoursAgg) {
    if (row._id) openHoursMap[row._id.toString()] = Number(row.hoursOnOpen) || 0;
  }

  const results: Record<string, ClientMonthlyBalanceResult> = {};

  for (const client of clients) {
    const id = client._id.toString();
    const totalContracted = Number(client.total_contracted_hours) || 0;

    const hasPrev = id in prevReportMap;
    const hasCurrent = id in currentConsumedMap;
    const hasLatestPrior = id in latestPriorMap;

    let previousBalance: number;
    if (hasPrev) {
      previousBalance = prevReportMap[id];
    } else if (hasLatestPrior) {
      previousBalance = latestPriorMap[id].remaining_balance;
    } else {
      previousBalance = Number(client.previous_balance_hours) || 0;
    }

    const hoursConsumed = hasCurrent ? currentConsumedMap[id] : (liveConsumedMap[id] || 0);
    const hoursOnOpen = openHoursMap[id] || 0;
    const currentBalance = previousBalance - hoursConsumed - hoursOnOpen;

    results[id] = {
      totalContracted,
      previousBalance,
      hoursConsumed,
      hoursOnOpen,
      currentBalance,
    };
  }

  return results;
}

/**
 * Reconciles historical October 2026 reports in the database where open-ticket allocations
 * were accidentally deducted into remaining_balance instead of storing the closed-ticket balance.
 *
 * Rule:
 * If oct.remaining_balance + openTickets == sep.remaining_balance - oct.hours_consumed,
 * then oct.remaining_balance had open tickets deducted and should be restored to its true
 * closed-ticket balance (sep.remaining_balance - oct.hours_consumed).
 */
export async function reconcileOctoberHistoricalBalances(): Promise<{ updatedCount: number; updatedClients: string[] }> {
  const octReports = await Report.find({ month: 10, year: 2026 });
  const updatedClients: string[] = [];

  for (const oct of octReports) {
    const clientId = oct.client_id;
    const sep = await Report.findOne({ client_id: clientId, month: 9, year: 2026 });
    if (!sep || sep.remaining_balance == null) continue;

    const expectedOctClosed = Number(sep.remaining_balance) - (Number(oct.hours_consumed) || 0);
    const discrepancy = expectedOctClosed - Number(oct.remaining_balance);

    if (discrepancy > 0.01) {
      // Find open cases for this client
      const openCases = await Case.find({
        client_id: clientId,
        $or: [
          { status_reason: { $not: closedStatusRegex } },
          { status_reason: null },
        ],
      });
      const openHours = openCases.reduce((sum: number, c: any) => sum + (Number(c.billable_duration) || 0), 0);

      // If discrepancy matches open tickets (within floating-point margin)
      if (Math.abs(discrepancy - openHours) < 0.05 || Math.abs(Number(oct.remaining_balance) + openHours - expectedOctClosed) < 0.05) {
        const client = await Client.findById(clientId);
        const clientName = client ? client.client_name : clientId.toString();

        await Report.updateOne(
          { _id: oct._id },
          { $set: { remaining_balance: expectedOctClosed } }
        );

        // Also ensure client's previous_balance_hours matches the closed-ticket balance
        await Client.updateOne(
          { _id: clientId },
          { $set: { previous_balance_hours: expectedOctClosed } }
        );

        updatedClients.push(`${clientName}: ${oct.remaining_balance} -> ${expectedOctClosed}`);
        logger.info(`Reconciled October 2026 closed-ticket balance for ${clientName}: was ${oct.remaining_balance}, now ${expectedOctClosed}`);
      }
    }
  }

  return { updatedCount: updatedClients.length, updatedClients };
}

