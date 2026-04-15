const { requestHostnameFromBrowser, isRequestHostAllowed } = require('../utils/domainAllowlist');

const cache = new Map();
const TTL_MS = 60 * 1000;
const MAX_CACHE_KEYS = 200;

/** Petya account API keys only; avoids treating LiveAvatar session Bearer tokens as Petya keys. */
function looksLikePetyaApiKey(value) {
  return typeof value === 'string' && /^SE_\d{16}$/.test(value.trim());
}

function extractPetyaApiKey(req) {
  const fromHeader = req.headers['x-api-key'];
  if (fromHeader && typeof fromHeader === 'string' && looksLikePetyaApiKey(fromHeader)) {
    return fromHeader.trim();
  }
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const t = auth.slice(7).trim();
    if (looksLikePetyaApiKey(t)) return t;
  }
  const q = req.query && req.query.api_key;
  if (q && typeof q === 'string' && looksLikePetyaApiKey(q)) {
    return q.trim();
  }
  return null;
}

function cacheSet(apiKey, domains) {
  if (cache.size >= MAX_CACHE_KEYS) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
  cache.set(apiKey, { domains, at: Date.now() });
}

/**
 * Fetches allowed_domains from Petya (same source as dashboard "Allowed Domains").
 * @param {string} baseUrl
 * @param {string} apiKey
 * @returns {Promise<string[]>}
 */
async function fetchPetyaAllowlist(baseUrl, apiKey) {
  const now = Date.now();
  const hit = cache.get(apiKey);
  if (hit && now - hit.at < TTL_MS) {
    return hit.domains;
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/account/domain-allowlist`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
      Accept: 'application/json',
    },
  });

  if (res.status === 401) {
    const err = new Error('INVALID_API_KEY');
    err.statusCode = 401;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(`Petya allowlist request failed: HTTP ${res.status}`);
    err.statusCode = 502;
    throw err;
  }

  const body = await res.json();
  const domains = Array.isArray(body?.data?.allowed_domains) ? body.data.allowed_domains.filter((d) => typeof d === 'string') : [];
  cacheSet(apiKey, domains);
  return domains;
}

/**
 * When PETYA_API_BASE_URL is set and the client sends the Petya account API key (SE_…),
 * enforces the same Allowed Domains policy as the Petya server by loading the list from Petya.
 * If the key is omitted, the proxy behaves as before (env LIVEAVATAR_API_KEY only).
 */
function petyaOriginGate(req, res, next) {
  const baseUrl = process.env.PETYA_API_BASE_URL;
  if (!baseUrl || typeof baseUrl !== 'string' || !baseUrl.trim()) {
    return next();
  }

  const apiKey = extractPetyaApiKey(req);
  if (!apiKey) {
    return next();
  }

  fetchPetyaAllowlist(baseUrl.trim(), apiKey)
    .then((domains) => {
      if (!domains.length) {
        return next();
      }
      const requestHost = requestHostnameFromBrowser(req);
      if (!requestHost) {
        return next();
      }
      if (!isRequestHostAllowed(requestHost, domains)) {
        return res.status(403).json({
          success: false,
          error:
            'This API key is not allowed from this domain. Add the site to Allowed Domains in Petya account settings.',
        });
      }
      return next();
    })
    .catch((err) => {
      if (err.statusCode === 401) {
        return res.status(401).json({
          success: false,
          error: 'Invalid Petya API key (X-API-KEY / Authorization / api_key).',
        });
      }
      console.error('[petyaOriginGate]', err.message);
      return res.status(err.statusCode || 502).json({
        success: false,
        error: err.message || 'Could not verify allowed domains with Petya.',
      });
    });
}

module.exports = { petyaOriginGate, extractPetyaApiKey };
