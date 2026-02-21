import { Room } from '@livekit/rtc-node';
import { getSessionInfo } from './transcript.js';

const AGENT_CONTROL_TOPIC = 'agent-control';

/**
 * Publish a command event to a LiveAvatar session's LiveKit room.
 * Connects with livekit_agent_token, publishes to agent-control topic, disconnects.
 * @param {string} sessionId - LiveAvatar session ID
 * @param {string} eventType - e.g. avatar.speak_response, avatar.speak_text, avatar.interrupt
 * @param {object} eventData - Additional data (e.g. { text: "Hello" })
 * @returns {Promise<boolean>} true if published successfully
 */
export async function publishLiveAvatarCommand(sessionId, eventType, eventData = {}) {
  const session = getSessionInfo(sessionId);
  const livekitUrl = session?.livekitUrl;
  const livekitAgentToken = session?.livekitAgentToken;

  if (!livekitUrl || !livekitAgentToken) {
    console.warn('[LiveKit] No credentials for session', sessionId, '- cannot publish command');
    return false;
  }

  const payload = {
    event_type: eventType,
    session_id: sessionId,
    ...eventData
  };

  const room = new Room();
  try {
    await room.connect(livekitUrl, livekitAgentToken, { autoSubscribe: false, dynacast: false });
    const data = new TextEncoder().encode(JSON.stringify(payload));
    await room.localParticipant.publishData(data, {
      topic: AGENT_CONTROL_TOPIC,
      reliable: true
    });
    if (process.env.DEBUG_TRANSCRIPT) {
      console.log('[LiveKit] Published', eventType, { sessionId, textPreview: eventData.text?.substring(0, 40) });
    }
    return true;
  } catch (err) {
    console.error('[LiveKit] Publish failed:', err.message);
    return false;
  } finally {
    try {
      await room.disconnect();
    } catch {
      // ignore
    }
  }
}
