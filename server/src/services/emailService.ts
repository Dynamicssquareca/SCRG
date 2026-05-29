import nodemailer from 'nodemailer';
import dns from 'dns';
import { env } from '../config/env';
import logger from '../utils/logger';

// Force IPv4 DNS resolution — prevents EHOSTUNREACH on networks without IPv6 SMTP routing
dns.setDefaultResultOrder('ipv4first');

// Create a reusable transporter using the default SMTP transport
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465, // true for 465 (SSL), false for 587 (STARTTLS)
  family: 4, // Force IPv4 — prevents EHOSTUNREACH on networks without IPv6 SMTP routing
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
} as any);

export interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export async function sendEmail({ to, cc, subject, html, text, attachments }: SendEmailOptions) {
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
      attachments,
    });
    
    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Error sending email:', error);
    throw error;
  }
}
