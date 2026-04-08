import nodemailer from 'nodemailer';
import { env } from '../config/env';
import logger from '../utils/logger';

// Create a reusable transporter using the default SMTP transport
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT, // Usually 587 for Office365
  secure: env.SMTP_PORT === 465, // true for 465, false for other ports
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, cc, subject, html, text }: SendEmailOptions) {
  if (!env.SMTP_USER || !env.SMTP_PASS || env.SMTP_USER.includes('put_your_email_here') || env.SMTP_PASS.includes('put_your_password_here')) {
    logger.warn('SMTP credentials are not configured. Email will not be sent.');
    logger.debug(`[MOCK EMAIL] TO: ${to} | SUBJECT: ${subject}`);
    return { mock: true, messageId: 'mock-id' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"Support Reports" <${env.SMTP_USER}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      cc: Array.isArray(cc) ? cc.join(', ') : cc,
      subject,
      html,
      text,
    });
    
    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Error sending email:', error);
    throw error;
  }
}
