/**
 * Extracts and validates customer API key from X-Api-Key or Authorization header.
 * Attaches customerApiKey to req for downstream use.
 */
export function extractApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || 
    (req.headers.authorization?.startsWith('Bearer ') 
      ? req.headers.authorization.slice(7) 
      : req.headers.authorization);
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'Missing API key',
      message: 'Provide X-Api-Key or Authorization header with customer API key'
    });
  }
  
  req.customerApiKey = apiKey;
  next();
}
