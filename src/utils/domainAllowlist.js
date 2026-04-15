/**
 * Hostname from browser Origin, else Referer (same rules as Petya server).
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function requestHostnameFromBrowser(req) {
  const origin = req.headers.origin;
  if (origin && typeof origin === 'string') {
    try {
      return new URL(origin).hostname.toLowerCase();
    } catch {
      /* continue */
    }
  }
  const referer = req.headers.referer;
  if (referer && typeof referer === 'string') {
    try {
      return new URL(referer).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  return null;
}

function hostMatchesEntry(requestHost, allowedHost) {
  if (!requestHost || !allowedHost) return false;
  if (requestHost === allowedHost) return true;
  return requestHost.endsWith('.' + allowedHost);
}

/**
 * @param {string} requestHost
 * @param {string[]} allowedList
 */
function isRequestHostAllowed(requestHost, allowedList) {
  if (!allowedList || !allowedList.length) return true;
  return allowedList.some((allowed) => hostMatchesEntry(requestHost, allowed));
}

module.exports = {
  requestHostnameFromBrowser,
  isRequestHostAllowed,
};
