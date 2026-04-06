import { Request, Response, NextFunction } from 'express';
import * as usageService from '../services/usageService';
import { successResponse } from '../utils/apiResponse';

export async function getMonthlyConsumption(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await usageService.getMonthlyUsage();
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
    // Accept optional ?month=3&year=2026 query params
    const month = req.query.month ? parseInt(req.query.month as string, 10) : undefined;
    const year  = req.query.year  ? parseInt(req.query.year  as string, 10) : undefined;
    const data = await usageService.getUsageGrid(month, year);
    successResponse(res, data);
  } catch (err) {
    next(err);
  }
}
