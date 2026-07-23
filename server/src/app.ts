import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://www.supportdesk.dynamicssquare.com',
  'https://supportdesk.dynamicssquare.com',
];

if (env.CLIENT_URL && !allowedOrigins.includes(env.CLIENT_URL)) {
  allowedOrigins.push(env.CLIENT_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.dynamicssquare.com') ||
      origin.endsWith('.vercel.app')
    ) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy blocked request from origin: ${origin}`), false);
  },
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/v1', routes);

// Serve React build in production
if (env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

// Global error handler
app.use(errorHandler);

export default app;


