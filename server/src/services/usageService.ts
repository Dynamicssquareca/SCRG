import { Case } from '../models/Case';
import { Report } from '../models/Report';
import { Client } from '../models/Client';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';

dayjs.extend(weekOfYear);

export async function getMonthlyUsageFromCases() {
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
  // Read ALL reports (sync and non-sync) sorted newest first
  const reports = await Report.find({})
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
  // Read ALL reports
  const reports = await Report.find({}).sort({ year: 1, month: 1 });

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

/**
 * Returns a usage grid for a specific month/year.
 * If no month/year provided, defaults to the most recent month that has any reports.
 * Reads ALL reports (is_sync_report is irrelevant — the data comes from actual case uploads).
 */
export async function getUsageGrid(month?: number, year?: number) {
  const clients = await Client.find({ is_active: true }).sort({ client_name: 1 });

  // Read ALL reports (not just sync ones)
  const allReports = await Report.find({}).sort({ year: 1, month: 1 });

  // Build list of available month-year combos
  const monthsSet = new Set<string>();
  allReports.forEach(r => {
    const monthStr = r.month < 10 ? `0${r.month}` : `${r.month}`;
    monthsSet.add(`${r.year}-${monthStr}`);
  });
  const sortedMonths = Array.from(monthsSet).sort();

  // Determine which month to show
  let targetMonthStr: string | null = null;
  if (month && year) {
    const mm = month < 10 ? `0${month}` : `${month}`;
    const candidate = `${year}-${mm}`;
    // Use the requested month if we have data for it, otherwise still send it back
    // so frontend can display "no data" clearly
    targetMonthStr = candidate;
  } else {
    // Default: most recent month with data
    targetMonthStr = sortedMonths.length > 0 ? sortedMonths[sortedMonths.length - 1] : null;
  }

  const selectedMonths = targetMonthStr ? [targetMonthStr] : [];

  const gridData = clients.map(client => {
    const row: any = { clientName: client.client_name, _id: client._id };
    selectedMonths.forEach(m => {
      const [yr, mo] = m.split('-').map(Number);
      const report = allReports.find(r =>
        r.client_id.toString() === client._id.toString() &&
        r.month === mo &&
        r.year === yr
      );
      row[m] = report ? report.hours_consumed : 0;
    });
    return row;
  });

  return {
    gridData,
    months: selectedMonths,
    availableMonths: sortedMonths,  // all months with data, for the dropdown
  };
}
