import { Client, IClient } from '../models/Client';
import { NotFoundError, ConflictError } from '../utils/apiResponse';
import mongoose from 'mongoose';

export async function getAllClients(query: any) {
  const { search, isActive, page = 1, limit = 50 } = query;
  
  // @ts-ignore
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

  return {
    clients,
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
