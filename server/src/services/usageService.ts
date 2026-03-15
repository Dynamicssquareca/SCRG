import { Case } from '../models/Case';
import { Report } from '../models/Report';
import { Client } from '../models/Client';
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';

dayjs.extend(weekOfYear);

export async function getMonthlyUsageFromCases() {
  // Aggregate cases by client and month for the last 6 months
  const sixMonthsAgo = dayjs().subtract(6, 'months').startOf('month').toDate();

  const cases = await Case.aggregate([
    {
      $match: {
        updated_on: { $gte: sixMonthsAgo },
        client_id: { $ne: null },
        status_reason: { $regex: /Closed/i }
      }
    },
    {
      $group: {
        _id: {
          client_id: '$client_id',
          year: { $year: '$updated_on' },
          month: { $month: '$updated_on' }
        },
        totalHours: { $sum: '$billable_duration' }
      }
    }
  ]);

  // Populate client names
  const populated = await Promise.all(cases.map(async (item) => {
    const client = await Client.findById(item._id.client_id).select('client_name');
    return {
      clientName: client?.client_name || 'Unknown',
      year: item._id.year,
      month: item._id.month,
      totalHours: item.totalHours
    };
  }));

  return populated;
}

export async function getMonthlyUsage() {
  // Aggregate reports by month and year
  const reports = await Report.find()
    .populate('client_id', 'client_name')
    .sort({ year: -1, month: -1 });

  return reports.map(r => ({
    clientName: (r.client_id as any)?.client_name || 'Unknown',
    month: r.month,
    year: r.year,
    hoursConsumed: r.hours_consumed,
    remainingBalance: r.remaining_balance
  }));
}

export async function getBalanceGrid() {
  const clients = await Client.find({ is_active: true }).sort({ client_name: 1 });
  const reports = await Report.find().sort({ year: 1, month: 1 });

  // Get unique months list
  const monthsSet = new Set<string>();
  reports.forEach(r => {
    const monthStr = r.month < 10 ? `0${r.month}` : `${r.month}`;
    monthsSet.add(`${r.year}-${monthStr}`);
  });
  const sortedMonths = Array.from(monthsSet).sort();

  const gridData = clients.map(client => {
    const row: any = { clientName: client.client_name };
    sortedMonths.forEach(m => {
      const [year, month] = m.split('-').map(Number);
      const report = reports.find(r => 
        r.client_id.toString() === client._id.toString() && 
        r.month === month && 
        r.year === year
      );
      row[m] = report ? report.remaining_balance : null;
    });
    return row;
  });

  return { gridData, months: sortedMonths };
}

export async function getUsageGrid() {
  const clients = await Client.find({ is_active: true }).sort({ client_name: 1 });
  const reports = await Report.find().sort({ year: 1, month: 1 });

  // Get unique months list
  const monthsSet = new Set<string>();
  reports.forEach(r => {
    const monthStr = r.month < 10 ? `0${r.month}` : `${r.month}`;
    monthsSet.add(`${r.year}-${monthStr}`);
  });
  const sortedMonths = Array.from(monthsSet).sort();

  const gridData = clients.map(client => {
    const row: any = { clientName: client.client_name, _id: client._id };
    sortedMonths.forEach(m => {
      const [year, month] = m.split('-').map(Number);
      const report = reports.find(r => 
        r.client_id.toString() === client._id.toString() && 
        r.month === month && 
        r.year === year
      );
      row[m] = report ? report.hours_consumed : 0;
    });
    return row;
  });

  return { gridData, months: sortedMonths };
}
