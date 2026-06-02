import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';

import app from './src/server.js';

const DATABASE_URL = defineSecret('DATABASE_URL');
const FRONTEND_URL = defineSecret('FRONTEND_URL');
const FRONTEND_URL_DEV = defineSecret('FRONTEND_URL_DEV');
const OPEN_FOOD_FACTS_USER_AGENT = defineSecret('OPEN_FOOD_FACTS_USER_AGENT');
const OWNER_EMAILS = defineSecret('OWNER_EMAILS');

export const api = onRequest(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
    secrets: [DATABASE_URL, FRONTEND_URL, FRONTEND_URL_DEV, OPEN_FOOD_FACTS_USER_AGENT, OWNER_EMAILS],
  },
  app
);
