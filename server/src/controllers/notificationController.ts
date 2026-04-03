import { Request, Response, NextFunction } from 'express';
import { Client } from '../models/Client';
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
      const endDate = dayjs(client.contract_end_date).startOf('day');
      const daysRemaining = endDate.diff(today, 'day');

      if (daysRemaining >= 0 && daysRemaining <= 30) {
        let level = 'info';
        if (daysRemaining <= 7) level = 'critical';
        else if (daysRemaining <= 15) level = 'warning';

        notifications.push({
          clientId: client._id,
          clientName: client.client_name,
          contractEndDate: client.contract_end_date,
          daysRemaining,
          level,
          message: `Contract for ${client.client_name} ends in ${daysRemaining} day(s)`
        });
      }
    }

    // Sort by days remaining (ascending)
    notifications.sort((a, b) => a.daysRemaining - b.daysRemaining);

    successResponse(res, notifications);
  } catch (err) { next(err); }
}
