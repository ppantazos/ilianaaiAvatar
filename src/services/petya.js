import axios from 'axios';

const PETYA_BASE_URL = process.env.PETYA_BASE_URL || 'https://your-petya-backend.com';
const AVATAR_SERVICE_SECRET = process.env.AVATAR_SERVICE_SECRET;

/**
 * Fetch avatar config from Petya for a customer.
 * @param {string} customerApiKey - Customer's API key
 * @returns {Promise<{avatarId, intro, knowledgeBaseId, voiceId}>}
 */
export async function getAvatarConfig(customerApiKey) {
  const response = await axios.get(`${PETYA_BASE_URL}/api/v1/avatar/config`, {
    headers: {
      'X-Api-Key': customerApiKey,
      'Content-Type': 'application/json'
    }
  });
  return response.data;
}

/**
 * Update conversation status when session ends.
 * @param {string} conversationId - Conversation ID
 * @param {object} body - { sessionId, status, transcript }
 */
export async function updateConversationStatus(conversationId, body) {
  await axios.post(
    `${PETYA_BASE_URL}/api/v1/avatar/conversations/${conversationId}/status`,
    body,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Avatar-Service-Secret': AVATAR_SERVICE_SECRET
      }
    }
  );
}
