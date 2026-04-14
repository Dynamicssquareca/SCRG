import { Request, Response, NextFunction } from 'express';
import { Upload } from '../models/Upload';
import { processFile } from '../services/dataProcessingService';
import { successResponse, ValidationError, NotFoundError } from '../utils/apiResponse';
import mongoose from 'mongoose';
import { IUpload } from '../models/Upload';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new ValidationError('No file uploaded');
    const { month, year, syncClientMaster } = req.body;
    if (!month || !year) throw new ValidationError('Month and year are required');

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    const shouldSync = syncClientMaster === 'true' || syncClientMaster === true;

    // Create upload record
    const upload = await Upload.create({
      user_id: new mongoose.Types.ObjectId(String(req.user!.id)),
      original_name: req.file.originalname,
      stored_name: req.file.originalname, // memory storage — no stored filename
      file_path: '',                        // not applicable with memory storage
      file_size_bytes: req.file.size,
      month: monthNum,
      year: yearNum,
      sync_client_master: shouldSync,
      status: 'processing',
    });
    const uploadId: string = (upload._id as mongoose.Types.ObjectId).toString();

    // Process file from in-memory buffer (works on Vercel + locally)
    const result = await (processFile as any)(req.file.buffer, uploadId, monthNum, yearNum, shouldSync);
    successResponse(res, {
      uploadId,
      originalName: req.file.originalname,
      rowCount: result.rowCount,
      clientsDetected: result.clientsDetected,
      status: 'completed',
      warnings: result.warnings,
    }, 201);
  } catch (err) { next(err); }
}

export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 20, month, year, status } = req.query;
    
    // @ts-ignore
    const filter: any = {};
    if (month) filter.month = Number(month);
    if (year) filter.year = Number(year);
    if (status) filter.status = String(status);

    const total = await Upload.countDocuments(filter);
    const uploads = await Upload.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    successResponse(res, {
      uploads,
      pagination: { 
        page: Number(page), 
        limit: Number(limit), 
        total, 
        totalPages: Math.ceil(total / Number(limit)) 
      },
    });
  } catch (err) { next(err); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const upload = await Upload.findById(req.params.id);
    if (!upload) throw new NotFoundError('Upload not found');
    successResponse(res, upload);
  } catch (err) { next(err); }
}
