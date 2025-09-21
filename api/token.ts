import type { VercelRequest, VercelResponse } from '@vercel/node';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // FIX: AGORA_APP_ID should be retrieved from environment variables for security and proper deployment of a serverless function.
  const APP_ID = process.env.AGORA_APP_ID;
  const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

  if (!APP_ID || !APP_CERTIFICATE) {
    const errorMessage = "CRITICAL SERVER ERROR: The AGORA_APP_ID or AGORA_APP_CERTIFICATE is not set in the Vercel environment variables. Please add them to your project settings and redeploy.";
    console.error(errorMessage);
    return res.status(500).json({ error: errorMessage });
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
    // FIX: Added the missing 7th argument `currentTimestamp` for the token creation timestamp.
    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      APP_ID,
      APP_CERTIFICATE,
      String(channelName),
      userAccount,
      role,
      privilegeExpiredTs,
      currentTimestamp
    );

    return res.status(200).json({ rtcToken: token });
  } catch (error) {
    console.error('Error generating Agora token:', error);
    return res.status(500).json({ error: 'Failed to generate token' });
  }
}
