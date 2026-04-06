import { Request, Response, NextFunction } from 'express';
import { Client } from '../models/Client';
import { ReminderSetting } from '../models/ReminderSetting';
import { ReminderLog } from '../models/ReminderLog';
import { AppSetting } from '../models/AppSetting';
import { sendTestReminder } from '../services/reminderService';
import { restartScheduler } from '../scheduler';
import { successResponse, NotFoundError } from '../utils/apiResponse';

export async function getReminders(req: Request, res: Response, next: NextFunction) {
  try {
    const clients = await Client.find({ is_active: true }).sort({ client_name: 1 });
    const settings = await ReminderSetting.find();

    const data = clients.map(client => {
      const setting = settings.find(s => s.client_id.toString() === client._id.toString());
      return {
        client,
        setting: setting || {
          is_enabled: false,
          reminder_days: [30],
          recipient_emails: [],
          cc_emails: [],
        }
      };
    });

    successResponse(res, data);
  } catch (err) {
    next(err);
  }
}

export async function saveReminderSetting(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { is_enabled, reminder_days, recipient_emails, cc_emails, send_time } = req.body;

    const client = await Client.findById(id);
    if (!client) throw new NotFoundError('Client not found');

    const setting = await ReminderSetting.findOneAndUpdate(
      { client_id: id },
      { is_enabled, reminder_days, recipient_emails, cc_emails, send_time },
      { new: true, upsert: true }
    );

    successResponse(res, setting);
  } catch (err) {
    next(err);
  }
}

export async function sendTest(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { to } = req.body;
    
    await sendTestReminder(id, to);
    
    successResponse(res, { message: 'Test email sent successfully' });
  } catch (err) {
    next(err);
  }
}

export async function getLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await ReminderLog.find()
      .populate('client_id', 'client_name')
      .sort({ sent_at: -1 })
      .limit(limit);
      
    successResponse(res, logs);
  } catch (err) {
    next(err);
  }
}

export async function deleteLogs(req: Request, res: Response, next: NextFunction) {
  try {
    await ReminderLog.deleteMany({});
    successResponse(res, { message: 'All logs cleared successfully' });
  } catch (err) {
    next(err);
  }
}

 
