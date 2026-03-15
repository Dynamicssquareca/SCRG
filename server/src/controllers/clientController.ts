import { Request, Response, NextFunction } from 'express';
import * as clientService from '../services/clientService';
import { successResponse } from '../utils/apiResponse';

export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await clientService.getAllClients(req.query);
    successResponse(res, result);
  } catch (err) { next(err); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const client = await clientService.getClientById(req.params.id);
    successResponse(res, client);
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const client = await clientService.createClient(req.body);
    successResponse(res, client, 201);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const client = await clientService.updateClient(req.params.id, req.body);
    successResponse(res, client);
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await clientService.deleteClient(req.params.id);
    successResponse(res, { message: 'Client deactivated' });
  } catch (err) { next(err); }
}
