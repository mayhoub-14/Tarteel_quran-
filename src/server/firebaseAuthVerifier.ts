import https from 'https';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const EXPECTED_PROJECT_ID = firebaseConfig.projectId;

interface PublicKeysCache {
  keys: Record<string, string>;
  expiresAt: number;
}

let publicKeysCache: PublicKeysCache | null = null;

/**
 * Fetches Google's official public x509 certificates used to sign Firebase ID tokens.
 * Caches keys according to Cache-Control headers (typically 6-12 hours).
 */
async function getGooglePublicKeys(): Promise<Record<string, string>> {
  const now = Date.now();
  if (publicKeysCache && publicKeysCache.expiresAt > now) {
    return publicKeysCache.keys;
  }

  return new Promise((resolve, reject) => {
    https.get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            return reject(new Error(`Failed to fetch Google public keys, HTTP status: ${res.statusCode}`));
          }
          const keys = JSON.parse(data);

          // Parse Cache-Control max-age header if available
          let maxAgeSeconds = 3600;
          const cacheControl = res.headers['cache-control'];
          if (cacheControl) {
            const match = cacheControl.match(/max-age=(\d+)/);
            if (match && match[1]) {
              maxAgeSeconds = parseInt(match[1], 10);
            }
          }

          publicKeysCache = {
            keys,
            expiresAt: now + (maxAgeSeconds * 1000)
          };
          resolve(keys);
        } catch (err) {
          reject(new Error(`Failed to parse Google public keys: ${err}`));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`Network error fetching Google public keys: ${err.message}`));
    });
  });
}

export interface VerifiedFirebaseToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  iss: string;
  aud: string;
  sub: string;
  auth_time: number;
  exp: number;
}

/**
 * Cryptographically verifies a Firebase ID Token using Google's public certificates.
 * Enforces strict RFC 7519 / Firebase JWT specifications:
 * 1. Must be a valid JWT with header and payload.
 * 2. Signature algorithm must be RS256.
 * 3. kid in header must match one of Google's public keys.
 * 4. Must not be expired (exp claim).
 * 5. aud must match the project's exact projectId.
 * 6. iss must match https://securetoken.google.com/<projectId>.
 * 7. sub must be a non-empty string corresponding to the user UID.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseToken> {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('MISSING_TOKEN: Firebase ID token is required');
  }

  // Decode unverified header to extract kid and alg
  const decodedToken = jwt.decode(idToken, { complete: true });
  if (!decodedToken || typeof decodedToken !== 'object' || !decodedToken.header) {
    throw new Error('MALFORMED_TOKEN: Unable to decode token header');
  }

  const { kid, alg } = decodedToken.header;
  if (alg !== 'RS256') {
    throw new Error(`INVALID_ALGORITHM: Expected RS256 algorithm, got ${alg}`);
  }

  if (!kid) {
    throw new Error('MISSING_KID: Token header lacks a kid');
  }

  // Fetch Google public keys
  const keys = await getGooglePublicKeys();
  const publicKey = keys[kid];
  if (!publicKey) {
    throw new Error('UNKNOWN_KID: Token signed with unknown or revoked key');
  }

  // Cryptographically verify signature and standard claims
  const verified = jwt.verify(idToken, publicKey, {
    algorithms: ['RS256'],
    audience: EXPECTED_PROJECT_ID,
    issuer: `https://securetoken.google.com/${EXPECTED_PROJECT_ID}`
  }) as VerifiedFirebaseToken;

  if (!verified.sub || typeof verified.sub !== 'string' || verified.sub.trim() === '') {
    throw new Error('INVALID_SUBJECT: Token subject (UID) is empty');
  }

  return {
    ...verified,
    uid: verified.sub
  };
}
