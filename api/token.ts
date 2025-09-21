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
    const errorMessage = "CRITICAL SERVER ERROR: The AGORA_APP_ID is missing from constants.ts or the AGORA_APP_CERTIFICATE is not set in the Vercel environment variables. Please add them and redeploy.";
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
    // FIX: The runtime error "Expected 7 arguments, but got 6" indicates the installed 'agora-token'
    // library version requires a 7th argument for this function. This argument is for stream privilege
    // expiration, and passing 0 sets it to never expire, resolving the crash.
    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      APP_ID,
      APP_CERTIFICATE,
      String(channelName),
      userAccount,
      role,
      privilegeExpiredTs,
      0
    );

    return res.status(200).json({ rtcToken: token });
  } catch (error) {
    console.error('Error generating Agora token:', error);
    if (error instanceof Error) {
        return res.status(500).json({ error: `Failed to generate token: ${error.message}` });
    }
    return res.status(500).json({ error: 'Failed to generate token due to an unknown error.' });
  }
}
