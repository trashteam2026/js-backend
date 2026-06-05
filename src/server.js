// Local development entry point ONLY. Used by `npm run dev`.
// Cloud Functions does NOT load this file — it imports the app from app.js via
// index.js and manages the port/listener itself.
import app from './app.js';
import { warnIfOwnerAllowlistEmpty } from './middleware/authMiddleware.js';

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
  warnIfOwnerAllowlistEmpty().catch((error) =>
    console.error('Owner allowlist startup check failed:', error)
  );
});
