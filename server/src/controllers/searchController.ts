import { Request, Response, NextFunction } from 'express';
import { Client } from '../models/Client';
import { Case } from '../models/Case';
import { Report } from '../models/Report';
import { successResponse } from '../utils/apiResponse';

export async function globalSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const q = String(req.query.q || '').trim();
    const limit = req.query.full === 'true' ? 50 : 6;

    if (!q || q.length < 1) {
      return successResponse(res, { clients: [], cases: [], reports: [] });
    }

    const regex = new RegExp(q, 'i');

    const [clients, cases, reports] = await Promise.all([
      Client.find({
        $or: [
          { client_name: regex },
          { account_manager: regex },
          { customer_success_mgr: regex },
        ],
      })
        .select('client_name account_manager customer_success_mgr is_active total_contracted_hours tool_version createdAt')
        .limit(limit)
        .lean(),

      Case.find({
        $or: [
          { case_number: regex },
          { customer_name: regex },
          { case_title: regex },
          { support_agent: regex },
          { contact: regex },
          { priority: regex },
        ],
      })
        .select('case_number customer_name contact created_on case_title support_agent status_reason priority country billable_duration total_days comments')
        .populate('client_id', 'client_name')
        .limit(limit)
        .lean(),

      Report.find({ file_name: { $ne: null } })
        .select('month year status file_name file_size_bytes tickets_opened tickets_closed tickets_pending hours_consumed remaining_balance generated_at')
        .populate({
          path: 'client_id',
          match: { client_name: regex },
          select: 'client_name',
        })
        .limit(req.query.full === 'true' ? 100 : 20)
        .lean()
        .then(docs => docs.filter((r: any) => r.client_id).slice(0, limit)),
    ]);

    return successResponse(res, { clients, cases, reports });
  } catch (err) {
    next(err);
  }
}
