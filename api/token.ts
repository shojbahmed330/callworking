import type { VercelRequest, VercelResponse } from '@vercel/node';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

// This is a Vercel Serverless Function (Node.js runtime).
// It replaces the previous proxy logic.
export default function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Environment variables for Agora credentials must be set in the Vercel deployment.
  // This is more secure than hardcoding them.
  const APP_ID = process.env.AGORA_APP_ID;
  const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

  if (!APP_ID || !APP_CERTIFICATE) {
    console.error("CRITICAL: AGORA_APP_ID or AGORA_APP_CERTIFICATE is not set in environment variables.");
    return res.status(500).json({ error: 'Server is not configured correctly for generating tokens.' });
  }

  // Extract channelName and uid from query parameters
  const { channelName, uid } = req.query;

  if (!channelName || !uid) {
    return res.status(400).json({ error: 'channelName and uid query parameters are required' });
  }
  
  const userAccount = String(uid); // The app uses string-based Firebase UIDs
  const role = RtcRole.PUBLISHER; // All users join as publishers to be able to speak/stream
  const expirationTimeInSeconds = 3600; // Token is valid for 1 hour
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  try {
    // Build the token using the user's string account (UID)
    const token = RtcTokenBuilder.buildTokenWithAccount(
        APP_ID,
        APP_CERTIFICATE,
        String(channelName),
        userAccount,
        role,
        privilegeExpiredTs
    );

    // Send the token back to the client
    return res.status(200).json({ rtcToken: token });

  } catch (error) {
    console.error("Error generating Agora token:", error);
    return res.status(500).json({ error: 'Failed to generate token.' });
  }
}
