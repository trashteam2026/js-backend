import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

function initializeFirebaseAdmin() {
  // Warm Cloud Functions instances reuse the loaded module, so initializeApp()
  // may have already run on a previous request. Never initialize twice.
  if (admin.apps.length > 0) {
    return;
  }

  const rawKey = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '').trim();

  // --- ABSENT: no key supplied at all ---
  // Expected deployed (Cloud Functions / Cloud Run) case. Fall back to
  // Application Default Credentials, which use the runtime service account.
  // `'{}'` is treated as absent because that is exactly what the old
  // `... || '{}'` fallback produced when the var was unset.
  if (rawKey === '' || rawKey === '{}') {
    admin.initializeApp();
    console.log(
      'Firebase Admin SDK initialized with Application Default Credentials (FIREBASE_SERVICE_ACCOUNT_KEY not provided)'
    );
    return;
  }

  // --- PRESENT: a key was supplied, so any problem is a real misconfiguration ---
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawKey);
  } catch (error) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_KEY is present but is not valid JSON: ${error.message}`
    );
  }

  // An entirely empty object (e.g. '{ }') carries no intent — treat as absent
  // and fall back to ADC rather than throwing.
  const keyCount =
    serviceAccount && typeof serviceAccount === 'object'
      ? Object.keys(serviceAccount).length
      : 0;

  if (keyCount === 0) {
    admin.initializeApp();
    console.log(
      'Firebase Admin SDK initialized with Application Default Credentials (FIREBASE_SERVICE_ACCOUNT_KEY was empty)'
    );
    return;
  }

  // A non-empty object without project_id is a broken key, not an absent one.
  if (!serviceAccount.project_id) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not properly configured'
    );
  }

  // --- Existing cert path, preserved exactly ---
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log(
    'Firebase Admin SDK initialized with explicit service-account credentials (cert)'
  );
}

try {
  initializeFirebaseAdmin();
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error.message);
  throw error;
}

export default admin;
