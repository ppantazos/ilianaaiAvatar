/**
 * List streaming avatars from Heygen or LiveAvatar.
 * Run: npm run list:avatars
 * Set USE_LIVEAVATAR=1 to list LiveAvatar avatars.
 */
import 'dotenv/config';
import axios from 'axios';

const useLiveAvatar = process.env.USE_LIVEAVATAR === '1';
const key = useLiveAvatar ? process.env.LIVEAVATAR_API_KEY : process.env.HEYGEN_API_KEY;
const baseUrl = useLiveAvatar ? (process.env.LIVEAVATAR_BASE_URL || 'https://api.liveavatar.com') : (process.env.HEYGEN_BASE_URL || 'https://api.heygen.com');

if (!key) {
  console.error('ERROR:', useLiveAvatar ? 'LIVEAVATAR_API_KEY' : 'HEYGEN_API_KEY', 'not set in .env');
  process.exit(1);
}

console.log(`Fetching avatars from ${useLiveAvatar ? 'LiveAvatar' : 'Heygen'}...\n`);

if (useLiveAvatar) {
  axios
    .get(`${baseUrl}/v1/avatars/public`, {
      headers: { 'X-API-KEY': key }
    })
    .then((res) => {
      const results = res.data?.data?.results || res.data?.results || [];
      if (results.length === 0) {
        console.log('No public avatars found. Migrate from Heygen at app.liveavatar.com first.');
        return;
      }
      console.log('Available avatars:\n');
      results.forEach((a, i) => {
        console.log(`  ${i + 1}. ${a.id}`);
        console.log(`     name: ${a.name || '-'}`);
        console.log(`     status: ${a.status || '-'}`);
        console.log('');
      });
      console.log('Copy an id above and add to .env: DEFAULT_AVATAR_ID=<id>');
    })
    .catch((err) => {
      console.error('FAILED:', err.response?.status, err.response?.data || err.message);
      process.exit(1);
    });
} else {
  axios
    .get(`${baseUrl}/v1/streaming/avatar.list`, {
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': key }
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
    })
    .catch((err) => {
      console.error('FAILED:', err.response?.status, err.response?.data || err.message);
      process.exit(1);
    });
}
