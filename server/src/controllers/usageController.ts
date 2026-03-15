import { Request, Response, NextFunction } from 'express';
import * as usageService from '../services/usageService';
import { successResponse } from '../utils/apiResponse';

export async function getMonthlyConsumption(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await usageService.getMonthlyUsage();
    // Transform data to match frontend totalHours expectation if needed, 
    // or just return as is. The frontend expects totalHours.
    const transformed = data.map(d => ({
      ...d,
      totalHours: d.hoursConsumed
    }));
    successResponse(res, transformed);
  } catch (err) { 
    next(err); 
  }
}

export async function getMonthlyUsage(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await usageService.getMonthlyUsage();
    successResponse(res, data);
  } catch (err) { 
    next(err); 
  }
}

export async function getBalanceGrid(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await usageService.getBalanceGrid();
    successResponse(res, data);
  } catch (err) { 
    next(err); 
  }
}

export async function getUsageGrid(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await usageService.getUsageGrid();
    successResponse(res, data);
  } catch (err) { 
    next(err); 
  }
}
