// Cloud Function for remote client error reporting to Google Cloud Logging.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');

exports.reportClientError = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data || {};
  const uid = request.auth.uid;

  // Sanitize and constrain size
  const type = String(data.type || 'unknown').slice(0, 50);
  const message = String(data.message || 'No message provided').slice(0, 1000);
  const stack = data.stack ? String(data.stack).slice(0, 4000) : undefined;
  const canvasId = data.canvasId ? String(data.canvasId).slice(0, 100) : null;
  const count = typeof data.count === 'number' ? data.count : 1;
  const online = Boolean(data.online);
  const userAgent = data.userAgent ? String(data.userAgent).slice(0, 200) : 'unknown';

  logger.error('[MMC_CLIENT_ERROR]', {
    type,
    message,
    stack,
    canvasId,
    uid,
    count,
    online,
    userAgent,
    reportedAt: new Date().toISOString()
  });

  return { success: true };
});
