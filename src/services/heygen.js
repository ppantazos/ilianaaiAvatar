import axios from 'axios';

const HEYGEN_BASE_URL = process.env.HEYGEN_BASE_URL || 'https://api.heygen.com';
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

/**
 * Heygen REST API client. Forwards requests with HEYGEN_API_KEY.
 */
export async function heygenPost(path, body = {}, headers = {}) {
  const url = `${HEYGEN_BASE_URL}${path}`;
  const response = await axios.post(url, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': HEYGEN_API_KEY,
      ...headers
    }
  });
  return response.data;
}
