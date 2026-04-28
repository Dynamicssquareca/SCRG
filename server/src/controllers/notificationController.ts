import { Request, Response, NextFunction } from 'express';
import { Client } from '../models/Client';
import { Case } from '../models/Case';
import { Report } from '../models/Report';
import { successResponse } from '../utils/apiResponse';
import dayjs from 'dayjs';


export async function getNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    // Fetch all active clients that have a contract_end_date
    const clients = await Client.find({
      is_active: true,
      contract_end_date: { $exists: true, $ne: null }
    });

    const notifications: any[] = [];
    const today = dayjs().startOf('day');

    for (const client of clients) {
      const endDateStr = client.contract_end_date!.toISOString().substring(0, 10);
      const endDate = dayjs(endDateStr).startOf('day');
      const daysRemaining = endDate.diff(today, 'day');

      if (daysRemaining <= 30) {
        let level = 'info';
        if (daysRemaining < 0) level = 'critical';
        else if (daysRemaining <= 7) level = 'critical';
        else if (daysRemaining <= 15) level = 'warning';

        notifications.push({
          clientId: client._id,
          clientName: client.client_name,
          contractEndDate: client.contract_end_date,
          daysRemaining,
          level,
          message: daysRemaining < 0
            ? `Contract for ${client.client_name} expired ${Math.abs(daysRemaining)} day(s) ago`
            : `Contract for ${client.client_name} ends in ${daysRemaining} day(s)`
        });
      }
    }

    // Sort by days remaining (ascending)
    notifications.sort((a, b) => a.daysRemaining - b.daysRemaining);

    successResponse(res, notifications);
  } catch (err) { next(err); }
}

/* GET /notifications/center — aggregated notification center data */
export async function getNotificationCenter(req: Request, res: Response, next: NextFunction) {
  try {
    const today = dayjs();
    const maxBalance = req.query.maxBalance ? Number(req.query.maxBalance) : 10;
    const minDays = req.query.minDays ? Number(req.query.minDays) : 15;

    const cutoffDate = today.subtract(minDays, 'day').toDate();
    const cutoff30 = today.add(30, 'day').toDate();

    // 1. Clients whose latest report has remaining_balance < maxBalance
    const activeClients = await Client.find({ is_active: true }).select('_id client_name account_manager total_contracted_hours previous_balance_hours');

    const lowBalanceClients: any[] = [];
    for (const client of activeClients) {
      // Find the most recent report for this client
      const latestReport = await Report.findOne({ client_id: client._id })
        .sort({ year: -1, month: -1 })
        .select('remaining_balance month year');

      // Use remaining_balance from report, fallback to previous_balance_hours on client
      const balance = latestReport
        ? latestReport.remaining_balance
        : (client.previous_balance_hours ?? 0);

      if (balance < maxBalance) {
        lowBalanceClients.push({
          clientId: client._id,
          clientName: client.client_name,
          accountManager: client.account_manager,
          balance,
          lastReportMonth: latestReport?.month ?? null,
          lastReportYear: latestReport?.year ?? null,
        });
      }
    }
    // Sort by balance ascending (most critical first)
    lowBalanceClients.sort((a, b) => a.balance - b.balance);

    // 2. Open tickets with created_on older than minDays
    const closedStatusRegex = /resolved|closed|problem solved/i;
    const longOpenCases = await Case.find({
      status_reason: { $not: closedStatusRegex },
      created_on: { $lt: cutoffDate, $ne: null },
    })
      .sort({ created_on: 1 })
      .select('case_number customer_name contact created_on billable_duration case_title support_agent');

    // 3. Contracts expiring within 30 days or already expired
    const contractClients = await Client.find({
      is_active: true,
      contract_end_date: { $exists: true, $ne: null },
      $or: [{ contract_end_date: { $lte: cutoff30 } }],
    }).sort({ contract_end_date: 1 });

    const contractAlerts = contractClients.map(c => {
      const endDate = dayjs(c.contract_end_date!.toISOString().substring(0, 10)).startOf('day');
      const daysRemaining = endDate.diff(today.startOf('day'), 'day');
      let level = 'info';
      if (daysRemaining < 0) level = 'critical';
      else if (daysRemaining <= 7) level = 'critical';
      else if (daysRemaining <= 15) level = 'warning';
      return {
        clientId: c._id,
        clientName: c.client_name,
        contractEndDate: c.contract_end_date,
        daysRemaining,
        level,
      };
    });

    successResponse(res, {
      lowBalanceClients: {
        count: lowBalanceClients.length,
        items: lowBalanceClients,
      },
      longOpenTickets: {
        count: longOpenCases.length,
        items: longOpenCases,
      },
      contractAlerts: {
        count: contractAlerts.length,
        expiredCount: contractAlerts.filter(c => c.daysRemaining < 0).length,
        upcomingCount: contractAlerts.filter(c => c.daysRemaining >= 0).length,
        items: contractAlerts,
      },
    });
  } catch (err) { next(err); }
}


