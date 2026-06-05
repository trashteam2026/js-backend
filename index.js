// Cloud Functions (gen2 / Cloud Run functions) entry point.
// Exports a single HTTPS function named `api` that serves the existing Express
// app. The frontend's firebase.json rewrites /auth/**, /categories/**,
// /items/**, /activity/**, /api/** and /health to this function, so the mounted
// route prefixes in src/app.js resolve identically to local dev.
import { onRequest } from 'firebase-functions/v2/https';

import app from './src/app.js';

export const api = onRequest(
  {
    region: 'us-central1',
    // Secrets already exist in Secret Manager and are injected as env vars at
    // runtime, matching how the live function is configured.
    secrets: [
      'DATABASE_URL',
      'FRONTEND_URL',
      'FRONTEND_URL_DEV',
      'OPEN_FOOD_FACTS_USER_AGENT',
      'OWNER_EMAILS',
    ],
  },
  app
);
