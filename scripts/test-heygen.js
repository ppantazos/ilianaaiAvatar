/**
 * Test HEYGEN_API_KEY directly against Heygen's API.
 * Run: node scripts/test-heygen.js
 */
import 'dotenv/config';
import axios from 'axios';

const key = process.env.HEYGEN_API_KEY;
const baseUrl = process.env.HEYGEN_BASE_URL || 'https://api.heygen.com';

if (!key) {
  console.error('ERROR: HEYGEN_API_KEY not set in .env');
  process.exit(1);
}

console.log('Testing Heygen API key...');
console.log('Key (first 8 chars):', key.substring(0, 8) + '...');
console.log('Endpoint:', `${baseUrl}/v1/streaming.create_token\n`);

axios
  .post(`${baseUrl}/v1/streaming.create_token`, {}, {
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': key
    }
  })
  .then((res) => {
    console.log('SUCCESS:', res.data);
    if (res.data?.data?.token) {
      console.log('\nToken received. Key is valid.');
    }
  })
  .catch((err) => {
    const status = err.response?.status;
    const data = err.response?.data;
    console.error('FAILED:', status, data || err.message);
    if (data?.code === 400112) {
      console.error('\nHeygen returned 401 Unauthorized. Your API key may be:');
      console.error('  - Invalid or expired');
      console.error('  - Not provisioned for Streaming Avatar (check Heygen plan)');
      console.error('  - From wrong Space (check Heygen App > Space Settings > API)');
    }
    process.exit(1);
  });
