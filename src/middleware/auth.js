/**
 * Extracts and validates customer API key from X-Api-Key or Authorization header.
 * Attaches customerApiKey to req for downstream use.
 *
 * For POST /v1/sessions/start: allows request with only Authorization: Bearer <session_token>
 * (forwarded to LiveAvatar; no customer key required).
 */
export function extractApiKey(req, res, next) {
  if (req.method === 'OPTIONS') return next();

  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : null;
  const apiKey = req.headers['x-api-key'] || bearer || req.headers.authorization;

  if (req.method === 'POST' && (req.path === '/v1/sessions/start' || req.originalUrl?.includes('/v1/sessions/start')) && bearer && !req.headers['x-api-key']) {
    req.sessionToken = bearer;
    return next();
  }

  if (!apiKey) {
    return res.status(401).json({
      error: 'Missing API key',
      message: 'Provide X-Api-Key or Authorization header with customer API key',
      _source: 'ilianaaiavatar',
      _hint: 'Send X-Api-Key header with your customer API key (e.g. SE_xxxx from SellEmbedded)'
    });
  }

  req.customerApiKey = apiKey;
  next();
}
