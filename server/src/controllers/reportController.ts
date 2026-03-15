import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { generateAllReports } from '../services/reportGenerationService';
import { successResponse, ValidationError, NotFoundError } from '../utils/apiResponse';
import { Report, IReport } from '../models/Report';
import { Upload } from '../models/Upload';
import mongoose from 'mongoose';

export async function generate(req: Request, res: Response, next: NextFunction) {
  try {
    const { uploadId, month, year } = req.body;
    if (!uploadId || !month || !year) throw new ValidationError('uploadId, month, and year are required');

    const upload = await Upload.findById(uploadId);
    if (!upload) throw new NotFoundError('Upload not found');

    const result = await generateAllReports(uploadId, Number(month), Number(year), String(req.user!.id));

    successResponse(res, {
      message: 'Report generation completed',
      ...result,
    });
  } catch (err) { next(err); }
}

export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 20, month, year, clientName, sortBy = 'generated_at', sortOrder = 'desc' } = req.query;

    const filter: any = { file_name: { $ne: null } }; // Only show reports with generated files
    if (month) filter.month = Number(month);
    if (year) filter.year = Number(year);

    let query = Report.find(filter).populate({
      path: 'client_id',
      match: clientName ? { client_name: { $regex: clientName, $options: 'i' } } : {},
      select: 'client_name',
    });

    const populatedReports = await query.exec();
    // Filter out reports where client match failed
    const validReports = populatedReports.filter(r => r.client_id !== null);

    const sortField = sortBy === 'client_name' ? 'client_id.client_name' : String(sortBy);
    const sortVal = sortOrder === 'desc' ? -1 : 1;

    // Sorting in memory since we populated the client details
    if (sortBy === 'client_name') {
      validReports.sort((a: any, b: any) => {
        const nameA = String(a.client_id?.client_name || '').toLowerCase();
        const nameB = String(b.client_id?.client_name || '').toLowerCase();
        return nameA < nameB ? -sortVal : (nameA > nameB ? sortVal : 0);
      });
    } else {
      validReports.sort((a: any, b: any) => {
        const valA = a[sortField];
        const valB = b[sortField];
        return valA < valB ? -sortVal : (valA > valB ? sortVal : 0);
      });
    }

    const total = validReports.length;
    const startIndex = (Number(page) - 1) * Number(limit);
    const paginatedReports = validReports.slice(startIndex, startIndex + Number(limit));

    // Map output to match previous structure
    const reports = paginatedReports.map((r: any) => ({
      _id: r._id,
      id: r._id,
      client_id: r.client_id?._id,
      upload_id: r.upload_id,
      month: r.month,
      year: r.year,
      file_name: r.file_name,
      file_path: r.file_path,
      file_size_bytes: r.file_size_bytes,
      tickets_opened: r.tickets_opened,
      tickets_closed: r.tickets_closed,
      tickets_pending: r.tickets_pending,
      hours_consumed: r.hours_consumed,
      generated_at: r.generated_at,
      client_name: r.client_id?.client_name,
    }));

    successResponse(res, {
      reports,
      pagination: { 
        page: Number(page), 
        limit: Number(limit), 
        total, 
        totalPages: Math.ceil(total / Number(limit)) 
      },
    });
  } catch (err) { next(err); }
}

export async function download(req: Request, res: Response, next: NextFunction) {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) throw new NotFoundError('Report not found');

    if (!report.file_path) throw new ValidationError('This is a seeded historical report and has no downloadable file.');
    if (!fs.existsSync(report.file_path)) throw new NotFoundError('Report file not found on disk');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${report.file_name || 'report.xlsx'}"`);
    fs.createReadStream(report.file_path).pipe(res);
  } catch (err) { next(err); }
}

export async function downloadAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { month, year } = req.query;
    if (!month || !year) throw new ValidationError('Month and year are required');

    const reports = await Report.find({ month: Number(month), year: Number(year) });

    if (reports.length === 0) throw new NotFoundError('No reports found for this period');

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const zipName = `Reports_${monthNames[Number(month) - 1]}${year}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const report of reports) {
      if (report.file_path && fs.existsSync(report.file_path)) {
        archive.file(report.file_path, { name: report.file_name || 'report.xlsx' });
      }
    }

    await archive.finalize();
  } catch (err) { next(err); }
}
