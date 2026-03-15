import { Client, IClient } from '../models/Client';
import { Report } from '../models/Report';
import { NotFoundError, ConflictError } from '../utils/apiResponse';
import mongoose from 'mongoose';

export async function getAllClients(query: any) {
  const { search, isActive, page = 1, limit = 50 } = query;
  
  const filter: any = {};

  if (isActive !== undefined) {
    filter.is_active = isActive === 'true' || isActive === true;
  }
  
  if (search) {
    filter.client_name = { $regex: search, $options: 'i' };
  }

  const total = await Client.countDocuments(filter);
  const clients = await Client.find(filter)
    .sort({ client_name: 1 })
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit));

  // Fetch the two most recent reports per client to get current + last month balance
  const clientIds = clients.map(c => c._id);
  const recentReports = await Report.aggregate([
    { $match: { client_id: { $in: clientIds } } },
    { $sort: { year: -1, month: -1 } },
    {
      $group: {
        _id: '$client_id',
        reports: { $push: { remaining_balance: '$remaining_balance', month: '$month', year: '$year' } }
      }
    }
  ]);

  const reportMap: Record<string, { current_balance: number | null; last_month_balance: number | null }> = {};
  for (const r of recentReports) {
    reportMap[r._id.toString()] = {
      current_balance: r.reports[0]?.remaining_balance ?? null,
      last_month_balance: r.reports[1]?.remaining_balance ?? null,
    };
  }

  // For clients with no matching reports (orphaned IDs), try name-based lookup
  const unmatchedClients = clients.filter(c => !reportMap[c._id.toString()]);
  if (unmatchedClients.length > 0) {
    // Build a name-to-report lookup by resolving ALL reports through a full aggregation
    const allReports = await Report.aggregate([
      { $sort: { year: -1, month: -1 } },
      {
        $group: {
          _id: '$client_id',
          reports: { $push: { remaining_balance: '$remaining_balance', month: '$month', year: '$year' } }
        }
      },
      {
        $lookup: {
          from: 'clients',
          localField: '_id',
          foreignField: '_id',
          as: 'client'
        }
      }
    ]);

    // Try matching by client name (case-insensitive)
    for (const uc of unmatchedClients) {
      const nameMatch = allReports.find(ar => {
        const clientName = ar.client?.[0]?.client_name;
        return clientName && clientName.toLowerCase() === uc.client_name.toLowerCase();
      });
      // If still no name match, look through cases or just use report data by position
      if (nameMatch) {
        reportMap[uc._id.toString()] = {
          current_balance: nameMatch.reports[0]?.remaining_balance ?? null,
          last_month_balance: nameMatch.reports[1]?.remaining_balance ?? null,
        };
      }
    }
  }

  const enrichedClients = clients.map(c => {
    const obj = c.toObject() as any;
    const id = c._id.toString();
    const reportData = reportMap[id];
    // Fallback to static previous_balance_hours when no report data exists
    obj.current_balance = reportData?.current_balance ?? obj.previous_balance_hours ?? 0;
    obj.last_month_balance = reportData?.last_month_balance ?? null;
    return obj;
  });


  return {
    clients: enrichedClients,
    pagination: { 
      page: Number(page), 
      limit: Number(limit), 
      total, 
      totalPages: Math.ceil(total / Number(limit)) 
    },
  };
}

export async function getClientById(id: string) {
  const client = await Client.findById(id);
  if (!client) throw new NotFoundError('Client not found');
  return client;
}

export async function createClient(data: any) {
  const existing = await Client.findOne({ client_name: data.clientName });
  if (existing) throw new ConflictError('Client name already exists');

  const client = await Client.create({
    client_name: data.clientName,
    account_manager: data.accountManager || null,
    customer_success_mgr: data.customerSuccessMgr || null,
    tool_version: data.toolVersion || null,
    contract_start_date: data.contractStartDate || null,
    contract_end_date: data.contractEndDate || null,
    total_contracted_hours: data.totalContractedHours || 0,
    previous_balance_hours: data.previousBalanceHours || 0,
    feedback_link: data.feedbackLink || null,
  });

  return client;
}

export async function updateClient(id: string, data: any) {
  const client = await Client.findById(id);
  if (!client) throw new NotFoundError('Client not found');

  const updateData: any = {};
  if (data.clientName !== undefined) updateData.client_name = data.clientName;
  if (data.accountManager !== undefined) updateData.account_manager = data.accountManager;
  if (data.customerSuccessMgr !== undefined) updateData.customer_success_mgr = data.customerSuccessMgr;
  if (data.toolVersion !== undefined) updateData.tool_version = data.toolVersion;
  if (data.contractStartDate !== undefined) updateData.contract_start_date = data.contractStartDate;
  if (data.contractEndDate !== undefined) updateData.contract_end_date = data.contractEndDate;
  if (data.totalContractedHours !== undefined) updateData.total_contracted_hours = data.totalContractedHours;
  if (data.previousBalanceHours !== undefined) updateData.previous_balance_hours = data.previousBalanceHours;
  if (data.feedbackLink !== undefined) updateData.feedback_link = data.feedbackLink;
  if (data.isActive !== undefined) updateData.is_active = data.isActive;

  const updatedClient = await Client.findByIdAndUpdate(id, updateData, { returnDocument: 'after' });
  return updatedClient;
}

export async function deleteClient(id: string) {
  const client = await Client.findById(id);
  if (!client) throw new NotFoundError('Client not found');
  await Client.findByIdAndDelete(id);
}
