import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { AppError } from '@/lib/errors';
import { getConfig } from '@/lib/config';

const COOKIE = 'cover_session';
const MAX_AGE = 60 * 60 * 12;
export type Session = { token: string; username: string; issuedAt: number };
type SessionCookie = { id: string; username: string; issuedAt: number };
type StoredSession = Session & { expiresAt: number };
const storeKey = Symbol.for('seafile-cover.sessions');
const sessionStore = ((globalThis as typeof globalThis & { [storeKey]?: Map<string, StoredSession> })[
  storeKey
] ??= new Map());

function key() {
  const secret = getConfig().sessionSecret;
  if (!secret || secret.length < 32) throw new Error('CONFIGURATION_MISSING');
  return createHash('sha256').update(secret).digest();
}

function seal(value: SessionCookie) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

function unseal(value: string): SessionCookie | null {
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const session = JSON.parse(
      Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString(),
    ) as SessionCookie;
    if (!session.id || !session.username || Date.now() - session.issuedAt > MAX_AGE * 1000) return null;
    return session;
  } catch {
    return null;
  }
}

/** Stores the upstream token server-side and gives the browser only an encrypted opaque reference. */
export async function setSession(session: Session) {
  if (sessionStore.size > 10_000) {
    const now = Date.now();
    for (const [id, stored] of sessionStore) if (stored.expiresAt < now) sessionStore.delete(id);
  }
  const id = randomBytes(32).toString('base64url');
  sessionStore.set(id, { ...session, expiresAt: Date.now() + MAX_AGE * 1000 });
  (await cookies()).set(COOKIE, seal({ id, username: session.username, issuedAt: session.issuedAt }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: getConfig().public.appUrl.startsWith('https://'),
    path: '/',
    maxAge: MAX_AGE,
  });
}

/** Removes both the server-side token and its browser cookie. */
export async function clearSession() {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  const session = value ? unseal(value) : null;
  if (session) sessionStore.delete(session.id);
  jar.delete(COOKIE);
}

/** Resolves and validates the current opaque session without exposing the token to the browser. */
export async function getSession() {
  const value = (await cookies()).get(COOKIE)?.value;
  const cookie = value ? unseal(value) : null;
  if (!cookie) return null;
  const stored = sessionStore.get(cookie.id);
  if (!stored || stored.expiresAt < Date.now()) {
    sessionStore.delete(cookie.id);
    return null;
  }
  return { token: stored.token, username: stored.username, issuedAt: stored.issuedAt };
}

/** Resolves the current session or raises a normalized authentication error. */
export async function requireSession() {
  const session = await getSession();
  if (!session) throw new AppError(401, 'session_expired', 'Your session has expired. Please sign in again.');
  return session;
}

/** Constant-time origin comparison for state-changing browser requests. */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const expected = new URL(getConfig().public.appUrl || request.url).origin;
  const a = Buffer.from(origin);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new AppError(403, 'invalid_origin', 'This request could not be verified.');
}
