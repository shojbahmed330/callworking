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
  
  const APP_ID = AGORA_APP_ID;
  const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

  if (!APP_ID || !APP_CERTIFICATE) {
    const errorMessage = "CRITICAL SERVER ERROR: The AGORA_APP_CERTIFICATE is not set in the Vercel environment variables. Please add it to your project settings and redeploy.";
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
    // FIX: The agora-token library's buildTokenWithUserAccount function expects 7 arguments in this version.
    // The token expiration and privilege expiration are now separate. Setting them to the same value is standard.
    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      APP_ID,
      APP_CERTIFICATE,
      String(channelName),
      userAccount,
      role,
      privilegeExpiredTs,
      privilegeExpiredTs
    );

    return res.status(200).json({ rtcToken: token });
  } catch (error) {
    console.error('Error generating Agora token:', error);
    return res.status(500).json({ error: 'Failed to generate token' });
  }
}
