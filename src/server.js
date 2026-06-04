import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { warnIfOwnerAllowlistEmpty } from './middleware/authMiddleware.js';
import activityRoutes from './routes/activityRoutes.js';
import authRoutes from './routes/authRoutes.js';
import categoriesRoutes from './routes/categoriesRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import barcodeRoutes from './routes/barcodeRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import volunteerRoutes from './routes/volunteerRoutes.js';

dotenv.config();

const app = express();

// Security headers — apply early, before CORS and all routes.
app.use(helmet());

// Rate limiter for public, unauthenticated endpoints only (20 req / 15 min per
// IP). Owner/authenticated routes are intentionally NOT limited.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP. Please try again in 15 minutes.',
  },
});

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.FRONTEND_URL_DEV,
      'http://localhost:5173',
      'https://localhost:5173',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ].filter(Boolean);

    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
};

app.use(cors(corsOptions));

app.use(cookieParser());
app.use(express.json());

app.use((req, res, next) => {
  req.url = req.url.replace(/\/+/g, '/');
  next();
});

// Throttle the public, unauthenticated POST endpoints only. Scoped to POST so
// CORS preflight (OPTIONS) is unaffected; the limiter calls next() and the
// request then falls through to its mounted router below.
app.post('/auth/signup', publicLimiter);
app.post('/api/barcode/lookup', publicLimiter);
app.post('/api/volunteer/verify', publicLimiter);

app.use('/auth', authRoutes);
app.use('/categories', categoriesRoutes);
app.use('/items', itemRoutes);
app.use('/activity', activityRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/volunteer', volunteerRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Error details:', {
    message: err.message,
    stack: err.stack,
    status: err.status || 500,
  });

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : err.message,
  });
});

if (process.env.NODE_ENV !== 'production') {
  console.log('CORS Configuration:', {
    allowedOrigins: [process.env.FRONTEND_URL, process.env.FRONTEND_URL_DEV],
    credentials: true,
  });
}

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
  warnIfOwnerAllowlistEmpty();
});
