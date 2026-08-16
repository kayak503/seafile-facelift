import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { getConfig } from '@/lib/config';

export type PublicShare = {
  name: string;
  type: 'file' | 'folder';
  upstreamLink: string;
  downloadLink: string;
  expiresAt?: string;
  description?: string;
  canDownload: boolean;
  passwordHash?: string;
};

function secret() {
  return getConfig().sessionSecret;
}
function key() {
  return createHash('sha256').update(secret()).digest();
}
function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

export function passwordDigest(password: string) {
  return createHmac('sha256', secret()).update(password).digest('hex');
}
export function shareCookieName(token: string) {
  return `seafile_facelift_share_${createHash('sha256').update(token).digest('hex').slice(0, 20)}`;
}
export function shareCookieValue(token: string) {
  return createHmac('sha256', secret()).update(`unlocked:${token}`).digest('base64url');
}
export function passwordsMatch(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Encrypts and authenticates share metadata so public URLs require no database lookup. */
export function sealPublicShare(value: PublicShare) {
  const normalized = {
    ...value,
    upstreamLink: safeUrl(value.upstreamLink),
    downloadLink: safeUrl(value.downloadLink),
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(normalized)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** Opens a Seafile-Facelift share payload, returning null for malformed, tampered, or unsafe data. */
export function openPublicShare(token: string): PublicShare | null {
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const value = JSON.parse(
      Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString(),
    ) as PublicShare;
    if (!value.name || !['file', 'folder'].includes(value.type) || !safeUrl(value.upstreamLink)) return null;
    if (value.downloadLink && !safeUrl(value.downloadLink)) return null;
    return value;
  } catch {
    return null;
  }
}

/** Tests expiration separately so callers can present an unavailable-link response. */
export function shareExpired(share: PublicShare) {
  return Boolean(share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now());
}
