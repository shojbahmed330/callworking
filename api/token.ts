import type { VercelRequest, VercelResponse } from '@vercel/node';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { AGORA_APP_ID } from '../constants';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Use the imported constant for APP_ID
  const APP_ID = AGORA_APP_ID;
  // Assume APP_CERTIFICATE is an environment variable set in Vercel.
  // This is a secret and should not be in the code.
  const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

  if (!APP_ID || !APP_CERTIFICATE) {
    console.error('Server configuration error: AGORA_APP_ID is missing from constants.ts or AGORA_APP_CERTIFICATE is not set in environment variables.');
    return res.status(500).json({ error: 'Token server not configured.' });
  }

  const { channelName, uid } = req.query;

  if (!channelName || !uid) {
    return res.status(400).json({ error: 'channelName and uid are required' });
  }

  const userAccount = String(uid);
  const role = RtcRole.PUBLISHER;
  const expirationTimeInSeconds = 3600; // 1 hour
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  try {
    // The app uses string Firebase UIDs, so buildTokenWithAccount is correct.
    const token = RtcTokenBuilder.buildTokenWithAccount(
      APP_ID,
      APP_CERTIFICATE,
      String(channelName),
      userAccount,
      role,
      privilegeExpiredTs
    );

    return res.status(200).json({ rtcToken: token });
  } catch (error) {
    console.error('Error generating Agora token:', error);
    return res.status(500).json({ error: 'Failed to generate token' });
  }
}
