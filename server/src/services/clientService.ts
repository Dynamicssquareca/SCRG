import { Client, IClient } from '../models/Client';
import { Report } from '../models/Report';
import { NotFoundError, ConflictError } from '../utils/apiResponse';
import mongoose from 'mongoose';

export async function getAllClients(query: any) {
  const { search, isActive, page = 1, limit = 50, month, year } = query;
  
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

  // Determine current and last month based on the query param (from Upload) or real calendar date
  const now = new Date();
  const currentMonth = month ? Number(month) : now.getMonth() + 1;
  const currentYear  = year  ? Number(year)  : now.getFullYear();

  // Calculate previous month and year
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear  = currentMonth === 1 ? currentYear - 1 : currentYear;

  const clientIds = clients.map(c => c._id);

  // Fetch current month's reports
  const currentReports = await Report.find({
    client_id: { $in: clientIds },
    month: currentMonth,
    year: currentYear,
  }).select('client_id remaining_balance');

  // Fetch previous month's reports
  const prevReports = await Report.find({
    client_id: { $in: clientIds },
    month: prevMonth,
    year: prevYear,
  }).select('client_id remaining_balance');

  // Build lookup maps
  const currentMap: Record<string, number> = {};
  for (const r of currentReports) {
    currentMap[r.client_id.toString()] = r.remaining_balance ?? 0;
  }

  const prevMap: Record<string, number> = {};
  for (const r of prevReports) {
    prevMap[r.client_id.toString()] = r.remaining_balance ?? 0;
  }

  const enrichedClients = clients.map(c => {
    const obj = c.toObject() as any;
    const id = c._id.toString();

    const hasCurrent = id in currentMap;
    const hasPrev    = id in prevMap;

    if (hasCurrent || hasPrev) {
      obj.current_balance    = hasCurrent ? currentMap[id] : 0;
      obj.last_month_balance = hasPrev    ? prevMap[id]    : null;
    } else {
      // Fallback: use static previous_balance_hours from Client when no reports exist
      obj.current_balance    = obj.previous_balance_hours ?? 0;
      obj.last_month_balance = null;
    }
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
  if (data.contractStartDate !== undefined) updateData.contract_start_date = data.contractStartDate || null;
  if (data.contractEndDate !== undefined) updateData.contract_end_date = data.contractEndDate || null;
  if (data.totalContractedHours !== undefined) updateData.total_contracted_hours = data.totalContractedHours;
  if (data.previousBalanceHours !== undefined) updateData.previous_balance_hours = data.previousBalanceHours;
  if (data.feedbackLink !== undefined) updateData.feedback_link = data.feedbackLink || null;
  if (data.isActive !== undefined) updateData.is_active = data.isActive;

  const updatedClient = await Client.findByIdAndUpdate(id, updateData, { returnDocument: 'after' });

  // If the balance is manually edited, forcefully update the most recent report
  // (any report, not just sync ones) so the Client Master frontend reflects it immediately.
  if (data.previousBalanceHours !== undefined) {
    const mostRecentReport = await Report.findOne({ client_id: id }).sort({ year: -1, month: -1 });
    if (mostRecentReport) {
      mostRecentReport.remaining_balance = data.previousBalanceHours;
      await mostRecentReport.save();
    }
    // If no report exists at all, the client.previous_balance_hours fallback handles display
  }

  return updatedClient;
}

export async function deleteClient(id: string) {
  const client = await Client.findById(id);
  if (!client) throw new NotFoundError('Client not found');
  await Client.findByIdAndDelete(id);
}
