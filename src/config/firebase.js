import dotenv from 'dotenv';
import admin from 'firebase-admin';

// Only load .env.local locally — Cloud Functions provides env via secrets
if (!process.env.FUNCTION_TARGET) {
  dotenv.config({ path: '.env.local' });
}

try {
  if (process.env.FUNCTION_TARGET) {
    // In Cloud Functions: use Application Default Credentials (automatic)
    admin.initializeApp();
  } else {
    const serviceAccount = JSON.parse(
      process.env.SERVICE_ACCOUNT_KEY || '{}'
    );

    if (!serviceAccount.project_id) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not properly configured'
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error.message);
  throw error;
}

export default admin;
