const express = require('express');
const liveAvatar = require('../services/liveAvatarClient');

const router = express.Router();

/** @type {string} */
let apiKey;

function ensureApiKey() {
  if (!apiKey) {
    throw new Error('LIVEAVATAR_API_KEY is not configured');
  }
}

/**
 * GET /api/avatars/public
 * Lists available public avatars.
 * Query: page, page_size
 */
router.get('/public', async (req, res) => {
  ensureApiKey();
  try {
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const page_size = req.query.page_size ? parseInt(req.query.page_size, 10) : 20;
    const data = await liveAvatar.listPublicAvatars(apiKey, { page, page_size });
    return res.json(data);
  } catch (err) {
    console.error('[/api/avatars/public]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to list avatars' });
  }
});

function init(config) {
  apiKey = config.apiKey;
}

module.exports = { router, init };
