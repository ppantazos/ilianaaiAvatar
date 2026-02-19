/**
 * List streaming avatars from Heygen using HEYGEN_API_KEY.
 * Run: npm run list:avatars
 * Use an avatar_id from the output for DEFAULT_AVATAR_ID or streaming.new body.
 */
import 'dotenv/config';
import axios from 'axios';

const key = process.env.HEYGEN_API_KEY;
const baseUrl = process.env.HEYGEN_BASE_URL || 'https://api.heygen.com';

if (!key) {
  console.error('ERROR: HEYGEN_API_KEY not set in .env');
  process.exit(1);
}

console.log('Fetching streaming avatars from Heygen...\n');

axios
  .get(`${baseUrl}/v1/streaming/avatar.list`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': key
    }
  })
  .then((res) => {
    const data = res.data?.data || [];
    if (data.length === 0) {
      console.log('No avatars found. Your account may have no streaming avatars yet.');
      return;
    }
    console.log('Available avatars:\n');
    data.forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.avatar_id}`);
      console.log(`     pose_name: ${a.pose_name || '-'}`);
      console.log(`     status: ${a.status || '-'}`);
      console.log('');
    });
    console.log('Copy an avatar_id above and add to .env: DEFAULT_AVATAR_ID=<avatar_id>');
    console.log('Or pass avatar_id in streaming.new request body.');
  })
  .catch((err) => {
    const status = err.response?.status;
    const data = err.response?.data;
    console.error('FAILED:', status, data || err.message);
    process.exit(1);
  });
